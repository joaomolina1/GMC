-- Role-level quotas and LLM model access (replaces per-user configuration)

CREATE TABLE IF NOT EXISTS role_quotas (
  role user_role PRIMARY KEY,
  monthly_token_limit BIGINT,
  monthly_cost_limit_eur NUMERIC(10, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_allowed_models (
  role user_role NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, model_id)
);

ALTER TABLE role_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_allowed_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_quotas_read" ON role_quotas FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_quotas_admin" ON role_quotas FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "role_allowed_models_read" ON role_allowed_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_allowed_models_admin" ON role_allowed_models FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Default quotas per role (NULL = unlimited)
INSERT INTO role_quotas (role, monthly_token_limit, monthly_cost_limit_eur) VALUES
  ('guest', 10000, 1.00),
  ('user', 500000, 50.00),
  ('power_user', 2000000, 200.00),
  ('admin', NULL, NULL),
  ('super_admin', NULL, NULL)
ON CONFLICT (role) DO NOTHING;

-- Default model access: user/power_user get latest tier; admin roles unrestricted (empty list = all)
INSERT INTO role_allowed_models (role, model_id)
SELECT 'user'::user_role, id FROM models
WHERE enabled = true AND id IN (
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_allowed_models (role, model_id)
SELECT 'power_user'::user_role, id FROM models
WHERE enabled = true AND tier IN ('haiku', 'sonnet', 'opus')
ON CONFLICT DO NOTHING;

INSERT INTO role_allowed_models (role, model_id)
SELECT 'guest'::user_role, id FROM models
WHERE id = 'claude-haiku-4-5'
ON CONFLICT DO NOTHING;

-- Quota status now resolves from the user's role
CREATE OR REPLACE FUNCTION get_user_quota_status(p_user_id UUID DEFAULT auth.uid())
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
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

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

-- Helper: model IDs allowed for a user based on their role (empty = all enabled models)
CREATE OR REPLACE FUNCTION get_role_allowed_model_ids(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_ids TEXT[];
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    v_role := 'user';
  END IF;

  -- Admin roles: unrestricted
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  SELECT ARRAY_AGG(model_id ORDER BY model_id) INTO v_ids
  FROM role_allowed_models
  WHERE role = v_role;

  RETURN COALESCE(v_ids, ARRAY[]::TEXT[]);
END;
$$;

GRANT EXECUTE ON FUNCTION get_role_allowed_model_ids(UUID) TO authenticated;

-- Stop creating per-user quotas on signup (role policies apply instead)
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

  RETURN NEW;
END;
$$;
