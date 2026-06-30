-- Conversation history: listing index + 60-day retention purge

CREATE INDEX IF NOT EXISTS conversations_user_agent_updated_idx
  ON conversations (user_id, agent_id, updated_at DESC);

-- Deletes conversations (messages + attachments cascade) older than retention_days.
CREATE OR REPLACE FUNCTION purge_old_conversations(retention_days INT DEFAULT 60)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM conversations
    WHERE updated_at < now() - make_interval(days => retention_days)
    RETURNING id
  )
  SELECT count(*)::INT INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_old_conversations(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_old_conversations(INT) TO service_role;
