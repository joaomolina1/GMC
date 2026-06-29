-- Add Claude Opus 4 and Sonnet 3.5 to model catalog

INSERT INTO models (id, provider, display_name, capabilities, input_price_per_mtok, output_price_per_mtok)
VALUES
  (
    'claude-opus-4-20250514',
    'anthropic',
    'Claude Opus 4',
    '["chat","vision","tools"]',
    15.0,
    75.0
  ),
  (
    'claude-3-5-sonnet-20241022',
    'anthropic',
    'Claude 3.5 Sonnet',
    '["chat","vision","tools"]',
    3.0,
    15.0
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  capabilities = EXCLUDED.capabilities,
  input_price_per_mtok = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok = EXCLUDED.output_price_per_mtok;
