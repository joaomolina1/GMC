-- A conta Hobby da Vercel só aceita crons diários. O minuto do Chartbeat e o
-- watchdog de clips (5 min) passam a ser disparados daqui, com Bearer lido do
-- Vault (`cron_scheduler_secret`). O valor não fica neste ficheiro.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chartbeat-diretos') THEN
    PERFORM cron.unschedule('chartbeat-diretos');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clips-watchdog') THEN
    PERFORM cron.unschedule('clips-watchdog');
  END IF;
END $$;

SELECT cron.schedule(
  'chartbeat-diretos',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://gmcprototypes.vercel.app/api/cron/chartbeat-diretos',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_scheduler_secret'),
        ''
      )
    ),
    timeout_milliseconds := 20000
  );
  $$
);

SELECT cron.schedule(
  'clips-watchdog',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://gmcprototypes.vercel.app/api/cron/clips-watchdog',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_scheduler_secret'),
        ''
      )
    ),
    timeout_milliseconds := 20000
  );
  $$
);
