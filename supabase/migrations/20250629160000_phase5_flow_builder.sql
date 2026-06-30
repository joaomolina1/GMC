-- Phase 5: Flow Builder — FK + policy fixes

ALTER TABLE flows
  ADD CONSTRAINT flows_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES flow_versions(id) ON DELETE SET NULL;

-- Allow flow version inserts by flow owner
DROP POLICY IF EXISTS "flow_versions_insert" ON flow_versions;
CREATE POLICY "flow_versions_insert" ON flow_versions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_id AND (f.owner_id = auth.uid() OR is_admin()))
  );

-- Allow inserting flow runs
DROP POLICY IF EXISTS "flow_runs_insert" ON flow_runs;
CREATE POLICY "flow_runs_insert" ON flow_runs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Allow inserting run steps for own runs
DROP POLICY IF EXISTS "flow_run_steps_insert" ON flow_run_steps;
CREATE POLICY "flow_run_steps_insert" ON flow_run_steps FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = run_id AND r.user_id = auth.uid())
  );

-- Allow updating own flow runs
DROP POLICY IF EXISTS "flow_runs_update" ON flow_runs;
CREATE POLICY "flow_runs_update" ON flow_runs FOR UPDATE
  USING (user_id = auth.uid());
