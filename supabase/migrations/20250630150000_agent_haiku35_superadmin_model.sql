-- Migrate all agents to Claude Haiku 3.5 and restrict model changes to super_admin.

UPDATE models
SET enabled = true, status = 'deprecated'
WHERE id = 'claude-3-5-haiku-20241022';

UPDATE agent_versions
SET
  model = 'claude-3-5-haiku-20241022',
  thinking_enabled = false
WHERE model IS DISTINCT FROM 'claude-3-5-haiku-20241022'
   OR thinking_enabled IS DISTINCT FROM false;

INSERT INTO role_allowed_models (role, model_id)
SELECT r.role, 'claude-3-5-haiku-20241022'
FROM unnest(ARRAY['guest', 'user', 'power_user']::user_role[]) AS r(role)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_agent_version_model_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := get_user_role();

  -- Service role / migrations: no authenticated user
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'super_admin' THEN
      NEW.model := 'claude-3-5-haiku-20241022';
      NEW.thinking_enabled := false;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.model IS DISTINCT FROM OLD.model THEN
    IF v_role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can change agent model';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_versions_model_guard ON agent_versions;

CREATE TRIGGER agent_versions_model_guard
  BEFORE INSERT OR UPDATE ON agent_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_agent_version_model_super_admin();
