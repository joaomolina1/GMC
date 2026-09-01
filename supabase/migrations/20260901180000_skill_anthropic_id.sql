-- Custom skills registered on Anthropic Skills API (/v1/skills)
ALTER TABLE agent_skill_packages
  ADD COLUMN IF NOT EXISTS anthropic_skill_id TEXT;

COMMENT ON COLUMN agent_skill_packages.anthropic_skill_id IS 'ID skill_* devolvido por POST /v1/skills; usado em container.skills type=custom';

CREATE INDEX IF NOT EXISTS agent_skill_packages_anthropic_idx
  ON agent_skill_packages(anthropic_skill_id)
  WHERE anthropic_skill_id IS NOT NULL;
