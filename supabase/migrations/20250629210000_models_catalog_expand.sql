-- Expand models catalog: status, tier, sort_order, notes

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Seed full Anthropic catalog (active + legacy + deprecated selectable; retired disabled)
INSERT INTO models (id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok, enabled, status, tier, sort_order, notes) VALUES
  ('claude-fable-5', 'anthropic', 'Claude Fable 5', '["chat","vision","tools","thinking"]', 10, 50, true, 'active', 'fable', 10, NULL),
  ('claude-mythos-5', 'anthropic', 'Claude Mythos 5 (Glasswing)', '["chat","vision","tools","thinking"]', 10, 50, true, 'active', 'fable', 11, 'Project Glasswing only'),
  ('claude-opus-4-8', 'anthropic', 'Claude Opus 4.8', '["chat","vision","tools","thinking"]', 5, 25, true, 'active', 'opus', 20, NULL),
  ('claude-opus-4-7', 'anthropic', 'Claude Opus 4.7', '["chat","vision","tools","thinking"]', 5, 25, true, 'legacy', 'opus', 21, NULL),
  ('claude-opus-4-6', 'anthropic', 'Claude Opus 4.6', '["chat","vision","tools","thinking"]', 5, 25, true, 'legacy', 'opus', 22, NULL),
  ('claude-opus-4-5', 'anthropic', 'Claude Opus 4.5', '["chat","vision","tools","thinking"]', 5, 25, true, 'legacy', 'opus', 23, NULL),
  ('claude-opus-4-5-20251101', 'anthropic', 'Claude Opus 4.5 (20251101)', '["chat","vision","tools","thinking"]', 5, 25, true, 'legacy', 'opus', 24, NULL),
  ('claude-opus-4-1', 'anthropic', 'Claude Opus 4.1 (deprecated)', '["chat","vision","tools","thinking"]', 15, 75, true, 'deprecated', 'opus', 25, NULL),
  ('claude-opus-4-1-20250805', 'anthropic', 'Claude Opus 4.1 (20250805)', '["chat","vision","tools","thinking"]', 15, 75, true, 'deprecated', 'opus', 26, NULL),
  ('claude-opus-4-0', 'anthropic', 'Claude Opus 4 (deprecated)', '["chat","vision","tools"]', 15, 75, true, 'deprecated', 'opus', 27, NULL),
  ('claude-opus-4-20250514', 'anthropic', 'Claude Opus 4 (20250514)', '["chat","vision","tools"]', 15, 75, true, 'deprecated', 'opus', 28, NULL),
  ('claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6', '["chat","vision","tools","thinking"]', 3, 15, true, 'active', 'sonnet', 40, NULL),
  ('claude-sonnet-4-5', 'anthropic', 'Claude Sonnet 4.5', '["chat","vision","tools","thinking"]', 3, 15, true, 'legacy', 'sonnet', 41, NULL),
  ('claude-sonnet-4-5-20250929', 'anthropic', 'Claude Sonnet 4.5 (20250929)', '["chat","vision","tools","thinking"]', 3, 15, true, 'legacy', 'sonnet', 42, NULL),
  ('claude-sonnet-4-0', 'anthropic', 'Claude Sonnet 4 (deprecated)', '["chat","vision","tools"]', 3, 15, true, 'deprecated', 'sonnet', 43, NULL),
  ('claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4 (20250514)', '["chat","vision","tools"]', 3, 15, true, 'deprecated', 'sonnet', 44, NULL),
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', '["chat","vision","tools","thinking"]', 1, 5, true, 'active', 'haiku', 50, NULL),
  ('claude-haiku-4-5-20251001', 'anthropic', 'Claude Haiku 4.5 (20251001)', '["chat","vision","tools","thinking"]', 1, 5, true, 'active', 'haiku', 51, NULL),
  ('claude-3-haiku-20240307', 'anthropic', 'Claude Haiku 3 (deprecated)', '["chat","vision","tools"]', 0.25, 1.25, true, 'deprecated', 'haiku', 52, NULL),
  ('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet (retired)', '["chat","vision","tools"]', 3, 15, false, 'retired', 'sonnet', 90, NULL),
  ('claude-3-5-sonnet-20240620', 'anthropic', 'Claude 3.5 Sonnet (20240620, retired)', '["chat","vision","tools"]', 3, 15, false, 'retired', 'sonnet', 91, NULL),
  ('claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku (retired)', '["chat","vision","tools"]', 0.8, 4, false, 'retired', 'haiku', 92, NULL),
  ('claude-3-7-sonnet-20250219', 'anthropic', 'Claude 3.7 Sonnet (retired)', '["chat","vision","tools","thinking"]', 3, 15, false, 'retired', 'sonnet', 93, NULL),
  ('claude-3-opus-20240229', 'anthropic', 'Claude Opus 3 (retired)', '["chat","vision","tools"]', 15, 75, false, 'retired', 'opus', 94, NULL)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  capabilities = EXCLUDED.capabilities,
  input_price_per_mtok = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok = EXCLUDED.output_price_per_mtok,
  enabled = EXCLUDED.enabled,
  status = EXCLUDED.status,
  tier = EXCLUDED.tier,
  sort_order = EXCLUDED.sort_order,
  notes = EXCLUDED.notes;
