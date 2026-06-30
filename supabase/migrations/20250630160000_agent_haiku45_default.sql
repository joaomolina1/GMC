-- Migrate all agents to Claude Haiku 4.5 (platform default).

UPDATE agent_versions
SET model = 'claude-haiku-4-5'
WHERE model IS DISTINCT FROM 'claude-haiku-4-5';

INSERT INTO role_allowed_models (role, model_id)
SELECT r.role, 'claude-haiku-4-5'
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
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_role IS DISTINCT FROM 'super_admin' THEN
      NEW.model := 'claude-haiku-4-5';
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
