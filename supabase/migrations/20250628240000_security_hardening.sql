-- Security hardening

-- Fix profile role self-escalation
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
  );

-- Fix match_chunks authorization
CREATE OR REPLACE FUNCTION match_chunks(
  p_agent_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> p_query_embedding) AS similarity
  FROM knowledge_chunks kc
  JOIN agents a ON a.id = kc.agent_id
  WHERE kc.agent_id = p_agent_id
    AND kc.embedding IS NOT NULL
    AND (
      a.owner_id = auth.uid()
      OR a.visibility = 'public'
      OR is_admin()
    )
  ORDER BY kc.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
