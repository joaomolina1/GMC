-- Keep Claude Haiku 4.5 as the platform default while preserving configurable access.

ALTER TABLE public.agent_versions
  ALTER COLUMN model SET DEFAULT 'claude-haiku-4-5';

INSERT INTO public.role_allowed_models (role, model_id)
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

  IF TG_OP = 'INSERT' THEN
    -- Service-role inserts and all non-super-admin inserts use the safe platform default.
    IF v_role IS NULL OR v_role IS DISTINCT FROM 'super_admin' THEN
      NEW.model := 'claude-haiku-4-5';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.model IS DISTINCT FROM OLD.model THEN
    IF v_role IS NULL OR v_role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can change agent model';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
