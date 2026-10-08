-- Janela fechada (de/até) no histórico dos diretos.
-- O mix ao minuto deixa de depender da idade do início: só sai do payload
-- quando a janela pedida é longa (mais de 8 dias), para um dia antigo continuar
-- a trazer a composição.

DROP FUNCTION IF EXISTS public.chartbeat_history_bundle(timestamptz, text);

CREATE FUNCTION public.chartbeat_history_bundle(
  p_from TIMESTAMPTZ,
  p_grain TEXT,
  p_to TIMESTAMPTZ DEFAULT NULL
)
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
      people,
      mix
    FROM chartbeat_channel_minutes
    WHERE captured_at >= p_from
      AND (p_to IS NULL OR captured_at <= p_to)
      AND p_grain IN ('minute', 'hour', 'day')
  ),
  agg AS (
    SELECT
      bucket,
      channel_slug,
      CASE
        WHEN p_grain = 'minute' THEN max(people)
        ELSE round(avg(people))::int
      END AS people_avg,
      CASE
        WHEN p_grain = 'minute'
          AND COALESCE(p_to, now()) - p_from > interval '8 days'
          THEN NULL
        WHEN NOT bool_or(mix <> '{}'::jsonb) THEN NULL
        ELSE jsonb_strip_nulls(jsonb_build_object(
          'direct', round(avg((mix->>'direct')::numeric))::int,
          'search', round(avg((mix->>'search')::numeric))::int,
          'social', round(avg((mix->>'social')::numeric))::int,
          'internal', round(avg((mix->>'internal')::numeric))::int,
          'links', round(avg((mix->>'links')::numeric))::int,
          'new', round(avg((mix->>'new')::numeric))::int,
          'returning', round(avg((mix->>'returning')::numeric))::int,
          'loyal', round(avg((mix->>'loyal')::numeric))::int,
          'mobile', round(avg((mix->>'mobile')::numeric))::int,
          'desktop', round(avg((mix->>'desktop')::numeric))::int,
          'tablet', round(avg((mix->>'tablet')::numeric))::int,
          'engaged_sec', CASE
            WHEN sum(people) FILTER (WHERE mix ? 'engaged_sec') > 0
            THEN round(
              sum((mix->>'engaged_sec')::numeric * people) FILTER (WHERE mix ? 'engaged_sec')
              / sum(people) FILTER (WHERE mix ? 'engaged_sec')
            )::int
          END,
          'playing', round(avg((mix->>'playing')::numeric))::int,
          'paused', round(avg((mix->>'paused')::numeric))::int,
          'unplayed', round(avg((mix->>'unplayed')::numeric))::int
        ))
      END AS mix
    FROM src
    GROUP BY bucket, channel_slug
  ),
  pts AS (
    SELECT
      bucket,
      jsonb_object_agg(channel_slug, people_avg) AS people,
      jsonb_object_agg(channel_slug, mix) FILTER (WHERE mix IS NOT NULL) AS mix
    FROM agg
    GROUP BY bucket
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object('bucket', bucket, 'people', people, 'mix', mix))
      ORDER BY bucket
    ),
    '[]'::jsonb
  )
  FROM pts;
$$;

REVOKE ALL ON FUNCTION public.chartbeat_history_bundle(timestamptz, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chartbeat_history_bundle(timestamptz, text, timestamptz) TO authenticated, service_role;
