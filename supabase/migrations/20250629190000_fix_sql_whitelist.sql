-- Fix execute_readonly_sql: enforce table whitelist (dead loop removed in phase 4)

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
  ref_tables TEXT[];
  t TEXT;
BEGIN
  normalized := lower(trim(p_query));

  IF NOT normalized LIKE 'select%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF normalized ~ '(insert|update|delete|drop|truncate|alter|create|grant|revoke|execute|copy|pg_sleep|pg_read_file|lo_import|dblink|;)' THEN
    RAISE EXCEPTION 'Forbidden SQL operation detected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = p_agent_id
      AND (a.owner_id = auth.uid() OR a.visibility = 'public' OR is_admin())
  ) THEN
    RAISE EXCEPTION 'Access denied to agent';
  END IF;

  IF normalized ~ '(auth\.|storage\.|pg_|information_schema)' THEN
    RAISE EXCEPTION 'System schemas are not accessible';
  END IF;

  SELECT array_agg(DISTINCT lower(m[1]))
  INTO ref_tables
  FROM regexp_matches(
    normalized,
    '(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)',
    'gi'
  ) AS m;

  IF ref_tables IS NOT NULL THEN
    FOREACH t IN ARRAY ref_tables LOOP
      IF NOT (t = ANY(allowed_tables)) THEN
        RAISE EXCEPTION 'Table % is not in whitelist', t;
      END IF;
    END LOOP;
  END IF;

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
