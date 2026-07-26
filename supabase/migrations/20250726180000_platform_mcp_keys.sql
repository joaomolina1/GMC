-- MCP auth keys for clients calling Remote MCP (/mcp)
-- Parallel to platform_api_keys (which authenticate /api/v1).
CREATE TABLE platform_mcp_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_mcp_keys_user_idx ON platform_mcp_keys(user_id);
CREATE INDEX platform_mcp_keys_hash_active_idx ON platform_mcp_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE platform_mcp_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_mcp_keys_admin" ON platform_mcp_keys
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "platform_mcp_keys_owner_read" ON platform_mcp_keys
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION validate_platform_mcp_key(p_key_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key platform_mcp_keys%ROWTYPE;
BEGIN
  SELECT * INTO v_key
  FROM platform_mcp_keys
  WHERE key_hash = p_key_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE platform_mcp_keys SET last_used_at = now() WHERE id = v_key.id;

  RETURN jsonb_build_object(
    'id', v_key.id,
    'user_id', v_key.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION validate_platform_mcp_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_platform_mcp_key(TEXT) TO service_role;
