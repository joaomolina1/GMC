-- Phase 6: Enterprise — Entra ID, quotas, rate limits, auditoria

-- Entra ID / SSO fields on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS entra_oid TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_entra_oid_idx ON profiles(entra_oid) WHERE entra_oid IS NOT NULL;

-- Default quotas on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, entra_oid, auth_provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'sub', NEW.raw_user_meta_data->>'oid'),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  );

  INSERT INTO public.user_quotas (user_id, monthly_token_limit, monthly_cost_limit_eur)
  VALUES (NEW.id, 500000, 50.00)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Admin can manage quotas
DROP POLICY IF EXISTS "user_quotas_admin" ON user_quotas;
CREATE POLICY "user_quotas_admin" ON user_quotas FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Rate limit buckets (per user, per endpoint, per minute)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  bucket_minute TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, endpoint, bucket_minute)
);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limit_buckets_own" ON rate_limit_buckets FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- Check monthly quota usage
CREATE OR REPLACE FUNCTION get_user_quota_status(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota user_quotas%ROWTYPE;
  v_tokens BIGINT;
  v_cost NUMERIC;
  v_month_start TIMESTAMPTZ;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_month_start := date_trunc('month', now());

  SELECT * INTO v_quota FROM user_quotas WHERE user_id = p_user_id;

  SELECT
    COALESCE(SUM(prompt_tokens + completion_tokens), 0),
    COALESCE(SUM(cost_eur), 0)
  INTO v_tokens, v_cost
  FROM usage_logs
  WHERE user_id = p_user_id AND created_at >= v_month_start;

  RETURN jsonb_build_object(
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

GRANT EXECUTE ON FUNCTION get_user_quota_status(UUID) TO authenticated;

-- Check and increment rate limit
CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_endpoint TEXT,
  p_user_id UUID DEFAULT auth.uid()
)
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
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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

GRANT EXECUTE ON FUNCTION check_and_increment_rate_limit(TEXT, UUID) TO authenticated;

-- Monthly cost rollup helper
CREATE OR REPLACE FUNCTION compute_cost_rollups(p_period DATE DEFAULT date_trunc('month', now())::date)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_period_end DATE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  v_period_end := (p_period + INTERVAL '1 month' - INTERVAL '1 day')::date;

  INSERT INTO cost_rollups (user_id, period_start, period_end, total_tokens, total_cost_eur)
  SELECT
    user_id,
    p_period,
    v_period_end,
    SUM(prompt_tokens + completion_tokens),
    SUM(cost_eur)
  FROM usage_logs
  WHERE created_at >= p_period AND created_at < p_period + INTERVAL '1 month'
  GROUP BY user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Default global rate limits (skip if already configured)
INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/chat', 30
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/chat');

INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/flows/run', 10
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/flows/run');

INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/knowledge/upload', 20
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/knowledge/upload');
