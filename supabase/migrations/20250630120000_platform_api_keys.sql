-- Platform API keys for external applications calling agents/flows
CREATE TABLE platform_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['agents:run', 'flows:run'],
  allowed_agent_ids UUID[],
  allowed_flow_ids UUID[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_api_keys_user_idx ON platform_api_keys(user_id);
CREATE INDEX platform_api_keys_hash_active_idx ON platform_api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE platform_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_api_keys_admin" ON platform_api_keys
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "platform_api_keys_owner_read" ON platform_api_keys
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Validate API key hash (service role only)
CREATE OR REPLACE FUNCTION validate_platform_api_key(p_key_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key platform_api_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key
  FROM platform_api_keys
  WHERE key_hash = p_key_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE platform_api_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'id', v_key.id,
    'user_id', v_key.user_id,
    'scopes', to_jsonb(v_key.scopes),
    'allowed_agent_ids', CASE WHEN v_key.allowed_agent_ids IS NULL THEN NULL
      ELSE to_jsonb(v_key.allowed_agent_ids) END,
    'allowed_flow_ids', CASE WHEN v_key.allowed_flow_ids IS NULL THEN NULL
      ELSE to_jsonb(v_key.allowed_flow_ids) END
  );
END;
$$;

REVOKE ALL ON FUNCTION validate_platform_api_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_platform_api_key(TEXT) TO service_role;

-- Rate limit for API routes (service role, explicit user_id)
CREATE OR REPLACE FUNCTION check_rate_limit_for_user_svc(p_endpoint TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_bucket TIMESTAMPTZ;
  v_count INT;
BEGIN
  SELECT requests_per_minute INTO v_limit
  FROM rate_limits
  WHERE (user_id = p_user_id OR user_id IS NULL) AND endpoint = p_endpoint
  ORDER BY user_id NULLS LAST
  LIMIT 1;

  v_limit := COALESCE(v_limit, 60);
  v_bucket := date_trunc('minute', now());

  INSERT INTO rate_limit_buckets (user_id, endpoint, bucket_minute, request_count)
  VALUES (p_user_id, p_endpoint, v_bucket, 1)
  ON CONFLICT (user_id, endpoint, bucket_minute)
  DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= v_limit,
    'limit', v_limit,
    'current', v_count,
    'endpoint', p_endpoint
  );
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit_for_user_svc(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit_for_user_svc(TEXT, UUID) TO service_role;

-- Quota check for API routes (service role, explicit user_id)
CREATE OR REPLACE FUNCTION get_user_quota_status_svc(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_quota role_quotas%ROWTYPE;
  v_tokens BIGINT;
  v_cost NUMERIC;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_month_start := date_trunc('month', now());

  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    v_role := 'user';
  END IF;

  SELECT * INTO v_quota FROM role_quotas WHERE role = v_role;
  IF NOT FOUND THEN
    v_quota.monthly_token_limit := 500000;
    v_quota.monthly_cost_limit_eur := 50.00;
  END IF;

  SELECT
    COALESCE(SUM(prompt_tokens + completion_tokens), 0),
    COALESCE(SUM(cost_eur), 0)
  INTO v_tokens, v_cost
  FROM usage_logs
  WHERE user_id = p_user_id AND created_at >= v_month_start;

  RETURN jsonb_build_object(
    'role', v_role,
    'tokens_used', v_tokens,
    'cost_used_eur', v_cost,
    'monthly_token_limit', v_quota.monthly_token_limit,
    'monthly_cost_limit_eur', v_quota.monthly_cost_limit_eur,
    'tokens_remaining', CASE WHEN v_quota.monthly_token_limit IS NULL THEN NULL
      ELSE GREATEST(v_quota.monthly_token_limit - v_tokens, 0) END,
    'cost_remaining_eur', CASE WHEN v_quota.monthly_cost_limit_eur IS NULL THEN NULL
      ELSE GREATEST(v_quota.monthly_cost_limit_eur - v_cost, 0) END,
    'quota_exceeded', (
      (v_quota.monthly_token_limit IS NOT NULL AND v_tokens >= v_quota.monthly_token_limit)
      OR (v_quota.monthly_cost_limit_eur IS NOT NULL AND v_cost >= v_quota.monthly_cost_limit_eur)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION get_user_quota_status_svc(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_quota_status_svc(UUID) TO service_role;

-- Default rate limits for public API
INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/v1/agents/run', 30
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/v1/agents/run');

INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/v1/flows/run', 20
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/v1/flows/run');
