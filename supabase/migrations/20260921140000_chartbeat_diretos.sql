-- Chartbeat · Diretos — histórico ao minuto dos lineares TVI / CNN.
-- A Chartbeat Real-Time API só dá o presente (toppages a cada ~3 s). O histórico
-- ao minuto é nosso: um cron Vercel grava um snapshot por minuto.
--
-- Concurrents de várias URLs (tviplayer /direto, /direto/tvi, /direto/TVI, app
-- «Direto - TVI», e CNN em tviplayer + cnnportugal.iol.pt) somam-se no mesmo canal.

CREATE TABLE IF NOT EXISTS chartbeat_ingest_runs (
  captured_at TIMESTAMPTZ PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  page_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  unmatched JSONB NOT NULL DEFAULT '[]',
  error TEXT
);

CREATE TABLE IF NOT EXISTS chartbeat_channel_minutes (
  captured_at TIMESTAMPTZ NOT NULL,
  channel_slug TEXT NOT NULL,
  people INT NOT NULL DEFAULT 0 CHECK (people >= 0),
  people_web INT NOT NULL DEFAULT 0 CHECK (people_web >= 0),
  people_app INT NOT NULL DEFAULT 0 CHECK (people_app >= 0),
  sources JSONB NOT NULL DEFAULT '[]',
  program_title TEXT,
  video_watching INT,
  PRIMARY KEY (captured_at, channel_slug)
);

CREATE INDEX IF NOT EXISTS chartbeat_channel_minutes_at_idx
  ON chartbeat_channel_minutes (captured_at DESC);

CREATE INDEX IF NOT EXISTS chartbeat_channel_minutes_slug_at_idx
  ON chartbeat_channel_minutes (channel_slug, captured_at DESC);

CREATE INDEX IF NOT EXISTS chartbeat_ingest_runs_started_idx
  ON chartbeat_ingest_runs (started_at DESC);

ALTER TABLE chartbeat_ingest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chartbeat_channel_minutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chartbeat_ingest_runs_select" ON chartbeat_ingest_runs;
CREATE POLICY "chartbeat_ingest_runs_select" ON chartbeat_ingest_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "chartbeat_channel_minutes_select" ON chartbeat_channel_minutes;
CREATE POLICY "chartbeat_channel_minutes_select" ON chartbeat_channel_minutes
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON chartbeat_ingest_runs FROM PUBLIC, anon;
REVOKE ALL ON chartbeat_channel_minutes FROM PUBLIC, anon;
GRANT SELECT ON chartbeat_ingest_runs, chartbeat_channel_minutes TO authenticated;
GRANT ALL ON chartbeat_ingest_runs, chartbeat_channel_minutes TO service_role;

-- Série histórica compacta (um ponto por intervalo, jsonb { slug: people }) para
-- caber no max-rows do PostgREST (~1000).
CREATE OR REPLACE FUNCTION public.chartbeat_history(p_from TIMESTAMPTZ, p_bucket_seconds INT)
RETURNS TABLE (bucket TIMESTAMPTZ, people JSONB)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH buckets AS (
    SELECT
      to_timestamp(floor(extract(epoch FROM captured_at) / p_bucket_seconds) * p_bucket_seconds) AS bucket,
      channel_slug,
      round(avg(people))::int AS people_avg
    FROM chartbeat_channel_minutes
    WHERE captured_at >= p_from
      AND p_bucket_seconds BETWEEN 60 AND 86400
    GROUP BY 1, 2
  )
  SELECT bucket, jsonb_object_agg(channel_slug, people_avg) AS people
  FROM buckets
  GROUP BY bucket
  ORDER BY bucket;
$$;

REVOKE ALL ON FUNCTION public.chartbeat_history(TIMESTAMPTZ, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chartbeat_history(TIMESTAMPTZ, INT) TO authenticated, service_role;
