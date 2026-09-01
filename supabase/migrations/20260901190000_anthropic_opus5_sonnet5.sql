-- Current Anthropic frontier models (API GET /v1/models, Sep 2026)
INSERT INTO models (id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok, enabled, status, tier, sort_order, notes) VALUES
  ('claude-opus-5', 'anthropic', 'Claude Opus 5', '["chat","vision","tools","thinking","effort"]', 5, 25, true, 'active', 'opus', 20, NULL),
  ('claude-sonnet-5', 'anthropic', 'Claude Sonnet 5', '["chat","vision","tools","thinking","effort"]', 2, 10, true, 'active', 'sonnet', 40, NULL)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  capabilities = EXCLUDED.capabilities,
  input_price_per_mtok = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok = EXCLUDED.output_price_per_mtok,
  enabled = EXCLUDED.enabled,
  status = EXCLUDED.status,
  tier = EXCLUDED.tier,
  sort_order = EXCLUDED.sort_order;

UPDATE models SET status = 'legacy', sort_order = 21
WHERE id = 'claude-opus-4-8' AND status = 'active';

UPDATE models SET status = 'legacy', sort_order = 41
WHERE id = 'claude-sonnet-4-6' AND status = 'active';

INSERT INTO role_allowed_models (role, model_id)
SELECT r.role, m.id
FROM unnest(ARRAY['user', 'power_user']::user_role[]) AS r(role)
CROSS JOIN unnest(ARRAY['claude-opus-5', 'claude-sonnet-5']) AS m(id)
ON CONFLICT DO NOTHING;
