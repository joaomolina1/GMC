-- Phase 3: Marketplace — RLS + helper functions

-- Allow reading profile basics for owners of public published agents
CREATE POLICY "profiles_select_marketplace_owners" ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.owner_id = profiles.id
        AND a.visibility = 'public'
        AND a.status = 'published'
    )
  );

-- Allow users to record clones they made
DROP POLICY IF EXISTS "clones_insert" ON agent_clones;
CREATE POLICY "clones_insert" ON agent_clones FOR INSERT
  WITH CHECK (cloned_by = auth.uid());

-- Increment download counter when an agent is cloned
CREATE OR REPLACE FUNCTION increment_agent_downloads(p_agent_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE agents SET downloads = downloads + 1, updated_at = now()
  WHERE id = p_agent_id
    AND visibility = 'public'
    AND status = 'published';
$$;

GRANT EXECUTE ON FUNCTION increment_agent_downloads(UUID) TO authenticated;
