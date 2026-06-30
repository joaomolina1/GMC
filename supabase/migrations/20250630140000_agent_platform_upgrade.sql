-- Agent platform: max_steps per version + MCP connections

ALTER TABLE agent_versions
  ADD COLUMN IF NOT EXISTS max_steps INTEGER NOT NULL DEFAULT 12;

COMMENT ON COLUMN agent_versions.max_steps IS 'Max tool-use loop iterations per agent turn';

CREATE TABLE IF NOT EXISTS agent_mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  auth_secret_ref TEXT,
  allowed_tools TEXT[],
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_mcp_connections_agent_id_idx ON agent_mcp_connections(agent_id);

ALTER TABLE agent_mcp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_mcp_owner" ON agent_mcp_connections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_mcp_connections.agent_id
      AND (a.owner_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_mcp_connections.agent_id
      AND (a.owner_id = auth.uid() OR is_admin())
    )
  );

CREATE TRIGGER agent_mcp_connections_updated_at
  BEFORE UPDATE ON agent_mcp_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
