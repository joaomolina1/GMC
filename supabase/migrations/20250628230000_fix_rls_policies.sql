-- Fix agents_select policy (remove invalid team_id reference)
DROP POLICY IF EXISTS "agents_select" ON agents;
CREATE POLICY "agents_select" ON agents FOR SELECT
  USING (
    owner_id = auth.uid()
    OR visibility = 'public'
    OR is_admin()
  );

CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR is_admin());

CREATE POLICY "usage_logs_insert" ON usage_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_admin());
