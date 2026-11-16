-- Remove as zonas Clips (Fase 7) e PT26 Tracking poll: tabelas, RPCs, tipos, cron, rate limits
-- e políticas de Storage. Os buckets `clips` e `pt26` (e os ficheiros) apagam-se no dashboard
-- (Storage → bucket → Delete bucket): o Supabase bloqueia DELETE direto em storage.objects/buckets.

-- Cron (pg_cron) que chamava /api/cron/clips-watchdog
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'clips-watchdog';

-- ---------------------------------------------------------------------------
-- Clips
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clip_renders, clip_decisions, clip_candidates, shot_changes,
  transcript_segments, transcripts, clip_jobs, video_assets CASCADE;

DROP FUNCTION IF EXISTS decide_clip_candidate(UUID, clip_decision_kind, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN);
DROP FUNCTION IF EXISTS claim_next_clip_job(TEXT, INT);
DROP FUNCTION IF EXISTS heartbeat_clip_job(UUID, TEXT, INT, INT);
DROP FUNCTION IF EXISTS complete_clip_job_step(UUID, TEXT, clip_job_step, INT, INT);
DROP FUNCTION IF EXISTS fail_clip_job(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS release_clip_job(UUID, TEXT);
DROP FUNCTION IF EXISTS claim_next_clip_render(TEXT, INT);
DROP FUNCTION IF EXISTS heartbeat_clip_render(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS complete_clip_render(UUID, TEXT, TEXT, DOUBLE PRECISION, BIGINT);
DROP FUNCTION IF EXISTS fail_clip_render(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS release_clip_render(UUID, TEXT);
DROP FUNCTION IF EXISTS requeue_stale_clip_jobs();
DROP FUNCTION IF EXISTS assert_candidate_approved();

DROP TYPE IF EXISTS clip_job_status, clip_job_step, clip_candidate_status, clip_decision_kind, clip_render_status;

DELETE FROM rate_limits WHERE endpoint LIKE '/api/clips/%';

DROP POLICY IF EXISTS "clips_upload" ON storage.objects;
DROP POLICY IF EXISTS "clips_update" ON storage.objects;
DROP POLICY IF EXISTS "clips_read" ON storage.objects;
DROP POLICY IF EXISTS "clips_delete" ON storage.objects;

-- ---------------------------------------------------------------------------
-- PT26 Tracking poll
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pt26_replace_week(JSONB, BOOLEAN);

DROP TABLE IF EXISTS pt26_results, pt26_quadros, pt26_import_previews, pt26_import_logs,
  pt26_weeks, pt26_questions, pt26_people, pt26_parties, pt26_settings CASCADE;

DELETE FROM rate_limits WHERE endpoint LIKE '/api/pt26/%';

DROP POLICY IF EXISTS "pt26_media_public_read" ON storage.objects;
