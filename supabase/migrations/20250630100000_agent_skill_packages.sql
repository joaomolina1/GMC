-- Agent Skill packages (.skill / ZIP with SKILL.md — formato Claude Agent Skills)
CREATE TABLE agent_skill_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  skill_md TEXT NOT NULL,
  extra_files JSONB NOT NULL DEFAULT '[]',
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX agent_skill_packages_agent_idx ON agent_skill_packages(agent_id);

ALTER TABLE agent_versions
  ADD COLUMN IF NOT EXISTS skill_package_ids JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN agent_versions.skill_package_ids IS 'IDs de agent_skill_packages ativos nesta versão';

ALTER TABLE agent_skill_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_skill_packages_owner" ON agent_skill_packages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_skill_packages.agent_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_skill_packages.agent_id
        AND (a.owner_id = auth.uid() OR is_admin())
    )
  );
