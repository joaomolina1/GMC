-- Replace temperature-centric config with effort + adaptive thinking (Anthropic API)
ALTER TABLE agent_versions
  ADD COLUMN IF NOT EXISTS effort TEXT NOT NULL DEFAULT 'medium'
    CHECK (effort IN ('low', 'medium', 'high', 'max')),
  ADD COLUMN IF NOT EXISTS thinking_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN agent_versions.effort IS 'Anthropic output_config.effort — low|medium|high|max';
COMMENT ON COLUMN agent_versions.thinking_enabled IS 'Enable adaptive thinking (thinking.type=adaptive) when model supports it';
