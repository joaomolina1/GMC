-- Link each MCP key to a companion platform API key (secret stored encrypted).
-- Lets /mcp call /api/v1 without a global GMC_API_KEY env var.

ALTER TABLE platform_mcp_keys
  ADD COLUMN IF NOT EXISTS linked_api_key_id UUID REFERENCES platform_api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_api_key_ciphertext TEXT;

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
    'user_id', v_key.user_id,
    'linked_api_key_id', v_key.linked_api_key_id,
    'linked_api_key_ciphertext', v_key.linked_api_key_ciphertext
  );
END;
$$;

REVOKE ALL ON FUNCTION validate_platform_mcp_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_platform_mcp_key(TEXT) TO service_role;
