-- Série histórica em jsonb único para não bater no max-rows do PostgREST (~1000).
-- 24h ao minuto = 1440 pontos; 30d ao minuto = ~43k. Um único documento cabe.
-- Hora e dia usam date_trunc no fuso Europe/Lisbon (não UTC).

CREATE OR REPLACE FUNCTION public.chartbeat_history_bundle(p_from TIMESTAMPTZ, p_grain TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH src AS (
    SELECT
      CASE
        WHEN p_grain = 'hour' THEN date_trunc('hour', captured_at AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
        WHEN p_grain = 'day' THEN date_trunc('day', captured_at AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'Europe/Lisbon'
        ELSE captured_at
      END AS bucket,
      channel_slug,
      people
    FROM chartbeat_channel_minutes
    WHERE captured_at >= p_from
      AND p_grain IN ('minute', 'hour', 'day')
  ),
  agg AS (
    SELECT
      bucket,
      channel_slug,
      CASE
        WHEN p_grain = 'minute' THEN max(people)
        ELSE round(avg(people))::int
      END AS people_avg
    FROM src
    GROUP BY bucket, channel_slug
  ),
  pts AS (
    SELECT bucket, jsonb_object_agg(channel_slug, people_avg) AS people
    FROM agg
    GROUP BY bucket
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('bucket', bucket, 'people', people)
      ORDER BY bucket
    ),
    '[]'::jsonb
  )
  FROM pts;
$$;

REVOKE ALL ON FUNCTION public.chartbeat_history_bundle(TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chartbeat_history_bundle(TIMESTAMPTZ, TEXT) TO authenticated, service_role;
