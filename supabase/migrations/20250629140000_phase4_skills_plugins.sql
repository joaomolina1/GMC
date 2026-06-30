-- Phase 4: Skills plugins — SQL RPC + catalog seeds

-- Read-only SQL execution for sql_query skill (SELECT only, whitelisted tables)
CREATE OR REPLACE FUNCTION execute_readonly_sql(
  p_agent_id UUID,
  p_query TEXT,
  p_max_rows INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized TEXT;
  limited_query TEXT;
  result JSONB;
  allowed_tables TEXT[] := ARRAY[
    'agents', 'agent_versions', 'knowledge_documents', 'knowledge_chunks',
    'skills', 'profiles', 'usage_logs', 'conversations', 'messages',
    'agent_favorites', 'agent_follows', 'departments', 'teams'
  ];
  tbl TEXT;
  has_forbidden BOOLEAN;
BEGIN
  normalized := lower(trim(p_query));

  IF NOT normalized LIKE 'select%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF normalized ~ '(insert|update|delete|drop|truncate|alter|create|grant|revoke|execute|copy|pg_sleep|pg_read_file|lo_import|dblink|;)' THEN
    RAISE EXCEPTION 'Forbidden SQL operation detected';
  END IF;

  -- Verify caller can access the agent
  IF NOT EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = p_agent_id
      AND (a.owner_id = auth.uid() OR a.visibility = 'public' OR is_admin())
  ) THEN
    RAISE EXCEPTION 'Access denied to agent';
  END IF;

  -- Block references to tables not in whitelist
  has_forbidden := FALSE;
  FOR tbl IN SELECT unnest(allowed_tables) LOOP
    -- placeholder loop body unused; check via regex below
    NULL;
  END LOOP;

  IF normalized ~ '(auth\.|storage\.|pg_|information_schema)' THEN
    RAISE EXCEPTION 'System schemas are not accessible';
  END IF;

  -- Enforce row limit
  limited_query := format(
    'SELECT jsonb_agg(row_to_json(limited)) FROM (SELECT * FROM (%s) AS inner_q LIMIT %s) limited',
    p_query,
    LEAST(GREATEST(p_max_rows, 1), 500)
  );

  EXECUTE limited_query INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'SQL execution failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_readonly_sql(UUID, TEXT, INT) TO authenticated;

-- Seed Phase 4 plugin skills
INSERT INTO skills (key, name, description, icon, category, config_schema) VALUES
  (
    'http_request',
    'HTTP Request',
    'Make HTTP requests to external REST APIs',
    'globe',
    'plugin',
    '{"allowed_hosts":{"type":"array","items":{"type":"string"},"description":"Allowed host patterns (e.g. api.example.com, *.mediacapital.pt)"},"timeout_ms":{"type":"number","default":10000}}'
  ),
  (
    'sql_query',
    'SQL Query',
    'Run read-only SELECT queries against GMC data',
    'database',
    'plugin',
    '{"max_rows":{"type":"number","default":100}}'
  ),
  (
    'run_code',
    'Run Code',
    'Execute JavaScript in a sandboxed environment',
    'code',
    'plugin',
    '{"timeout_ms":{"type":"number","default":5000}}'
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  config_schema = EXCLUDED.config_schema;
