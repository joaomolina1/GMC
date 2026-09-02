-- Clips — Fase 1 (arquivo/VOD)
-- Sugestão automática de clips: upload direto → fila de jobs (worker em container) →
-- candidatos revistos por um editor → renders só de candidatos aprovados.
--
-- Regras que nenhum caminho de código pode contornar:
--   * clip_renders só aceita candidatos 'approved' (trigger BEFORE INSERT, também para service_role)
--   * clip_decisions é append-only para utilizadores (sem UPDATE/DELETE)
--   * clip_jobs só muda de estado via RPCs do worker (service_role)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE clip_job_status AS ENUM ('queued', 'running', 'failed', 'done');
CREATE TYPE clip_job_step AS ENUM (
  'probe', 'extract_audio', 'detect_shots', 'transcribe', 'suggest', 'vision_check', 'ready'
);
CREATE TYPE clip_candidate_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE clip_decision_kind AS ENUM ('approved', 'rejected');
CREATE TYPE clip_render_status AS ENUM ('queued', 'running', 'failed', 'done');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime TEXT,
  size_bytes BIGINT,
  duration_sec DOUBLE PRECISION,
  fps DOUBLE PRECISION,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX video_assets_owner_idx ON video_assets (owner_id, created_at DESC);

CREATE TABLE clip_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id UUID NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status clip_job_status NOT NULL DEFAULT 'queued',
  step clip_job_step NOT NULL DEFAULT 'probe',
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  lease_until TIMESTAMPTZ,
  worker_id TEXT,
  error TEXT,
  error_step clip_job_step,
  params JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clip_jobs_claim_idx ON clip_jobs (status, lease_until, created_at);
CREATE INDEX clip_jobs_user_idx ON clip_jobs (user_id, created_at DESC);
CREATE INDEX clip_jobs_asset_idx ON clip_jobs (video_asset_id);

CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id UUID NOT NULL UNIQUE REFERENCES video_assets(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT,
  language TEXT,
  word_count INT NOT NULL DEFAULT 0,
  raw_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  start_sec DOUBLE PRECISION NOT NULL,
  end_sec DOUBLE PRECISION NOT NULL,
  speaker TEXT,
  text TEXT NOT NULL,
  -- [{ "w": "palavra", "s": 12.34, "e": 12.80, "p": 0.97 }]
  words JSONB NOT NULL DEFAULT '[]',
  UNIQUE (transcript_id, idx),
  CHECK (end_sec >= start_sec)
);

CREATE INDEX transcript_segments_time_idx ON transcript_segments (transcript_id, start_sec);

CREATE TABLE shot_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id UUID NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  t_sec DOUBLE PRECISION NOT NULL,
  score DOUBLE PRECISION
);

CREATE INDEX shot_changes_time_idx ON shot_changes (video_asset_id, t_sec);

CREATE TABLE clip_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES clip_jobs(id) ON DELETE CASCADE,
  video_asset_id UUID NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  -- O que o modelo devolveu (antes do snapping) — guardado para auditoria/avaliação.
  model_in_sec DOUBLE PRECISION NOT NULL,
  model_out_sec DOUBLE PRECISION NOT NULL,
  -- Intervalo efetivo (após snapping e ajustes do editor).
  in_sec DOUBLE PRECISION NOT NULL,
  out_sec DOUBLE PRECISION NOT NULL,
  title TEXT NOT NULL,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  rationale TEXT,
  transcript_excerpt TEXT,
  speakers TEXT[] NOT NULL DEFAULT '{}',
  prompt_id TEXT NOT NULL,
  prompt_version INT NOT NULL,
  model TEXT NOT NULL,
  window_index INT,
  snap_debug JSONB,
  thumbnail_storage_path TEXT,
  vision_checked BOOLEAN NOT NULL DEFAULT false,
  vision_notes TEXT,
  status clip_candidate_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (in_sec >= 0 AND out_sec > in_sec)
);

CREATE INDEX clip_candidates_job_idx ON clip_candidates (job_id, score DESC);
CREATE INDEX clip_candidates_asset_idx ON clip_candidates (video_asset_id);

-- Append-only. Alimenta a reordenação futura dos candidatos (TODO(fase-2)).
CREATE TABLE clip_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES clip_candidates(id) ON DELETE CASCADE,
  decided_by UUID NOT NULL REFERENCES profiles(id),
  decision clip_decision_kind NOT NULL,
  reason TEXT,
  in_sec DOUBLE PRECISION NOT NULL,
  out_sec DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clip_decisions_candidate_idx ON clip_decisions (candidate_id, created_at DESC);
CREATE INDEX clip_decisions_user_idx ON clip_decisions (decided_by, created_at DESC);

CREATE TABLE clip_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES clip_candidates(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  status clip_render_status NOT NULL DEFAULT 'queued',
  -- Intervalo aprovado no momento da decisão (imutável mesmo que o candidato mude depois).
  in_sec DOUBLE PRECISION NOT NULL,
  out_sec DOUBLE PRECISION NOT NULL,
  burn_subtitles BOOLEAN NOT NULL DEFAULT true,
  storage_path TEXT,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  lease_until TIMESTAMPTZ,
  worker_id TEXT,
  duration_sec DOUBLE PRECISION,
  size_bytes BIGINT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (in_sec >= 0 AND out_sec > in_sec)
);

CREATE INDEX clip_renders_claim_idx ON clip_renders (status, lease_until, created_at);
CREATE INDEX clip_renders_candidate_idx ON clip_renders (candidate_id, created_at DESC);

-- updated_at
CREATE TRIGGER video_assets_updated_at BEFORE UPDATE ON video_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clip_jobs_updated_at BEFORE UPDATE ON clip_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clip_candidates_updated_at BEFORE UPDATE ON clip_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clip_renders_updated_at BEFORE UPDATE ON clip_renders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Guarda humana: nenhum render sem candidato aprovado (vale para o service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_candidate_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status clip_candidate_status;
BEGIN
  SELECT status INTO v_status FROM clip_candidates WHERE id = NEW.candidate_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'clip_renders: candidato % não existe', NEW.candidate_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'clip_renders: candidato % não está aprovado (estado: %)', NEW.candidate_id, v_status
      USING ERRCODE = 'check_violation', HINT = 'Aprove o candidato antes de pedir o render.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clip_renders_require_approval
  BEFORE INSERT OR UPDATE OF candidate_id ON clip_renders
  FOR EACH ROW EXECUTE FUNCTION assert_candidate_approved();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shot_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clip_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_assets_select" ON video_assets FOR SELECT
  USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY "video_assets_insert" ON video_assets FOR INSERT
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "video_assets_update" ON video_assets FOR UPDATE
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "video_assets_delete" ON video_assets FOR DELETE
  USING (owner_id = auth.uid() OR is_admin());

-- Utilizadores só criam e leem jobs; o estado muda exclusivamente via RPCs do worker.
CREATE POLICY "clip_jobs_select" ON clip_jobs FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "clip_jobs_insert" ON clip_jobs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM video_assets v WHERE v.id = clip_jobs.video_asset_id AND v.owner_id = auth.uid())
  );

CREATE POLICY "transcripts_select" ON transcripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM video_assets v
    WHERE v.id = transcripts.video_asset_id AND (v.owner_id = auth.uid() OR is_admin())
  ));

CREATE POLICY "transcript_segments_select" ON transcript_segments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM transcripts t
    JOIN video_assets v ON v.id = t.video_asset_id
    WHERE t.id = transcript_segments.transcript_id AND (v.owner_id = auth.uid() OR is_admin())
  ));

CREATE POLICY "shot_changes_select" ON shot_changes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM video_assets v
    WHERE v.id = shot_changes.video_asset_id AND (v.owner_id = auth.uid() OR is_admin())
  ));

CREATE POLICY "clip_candidates_select" ON clip_candidates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clip_jobs j
    WHERE j.id = clip_candidates.job_id AND (j.user_id = auth.uid() OR is_admin())
  ));
-- O editor ajusta in/out/título; o estado só muda via decide_clip_candidate() (grants por coluna abaixo).
CREATE POLICY "clip_candidates_update" ON clip_candidates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clip_jobs j WHERE j.id = clip_candidates.job_id AND j.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clip_jobs j WHERE j.id = clip_candidates.job_id AND j.user_id = auth.uid()));

CREATE POLICY "clip_decisions_select" ON clip_decisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clip_candidates c
    JOIN clip_jobs j ON j.id = c.job_id
    WHERE c.id = clip_decisions.candidate_id AND (j.user_id = auth.uid() OR is_admin())
  ));
CREATE POLICY "clip_decisions_insert" ON clip_decisions FOR INSERT
  WITH CHECK (
    decided_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM clip_candidates c
      JOIN clip_jobs j ON j.id = c.job_id
      WHERE c.id = clip_decisions.candidate_id AND j.user_id = auth.uid()
    )
  );

CREATE POLICY "clip_renders_select" ON clip_renders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clip_candidates c
    JOIN clip_jobs j ON j.id = c.job_id
    WHERE c.id = clip_renders.candidate_id AND (j.user_id = auth.uid() OR is_admin())
  ));

-- Grants: o Supabase concede ALL por defeito a anon/authenticated; restringimos ao mínimo.
REVOKE INSERT, UPDATE, DELETE ON clip_jobs FROM anon, authenticated;
GRANT INSERT ON clip_jobs TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON transcripts, transcript_segments, shot_changes FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON clip_candidates FROM anon, authenticated;
GRANT UPDATE (in_sec, out_sec, title, snap_debug) ON clip_candidates TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON clip_decisions FROM anon, authenticated;
GRANT INSERT ON clip_decisions TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON clip_renders FROM anon, authenticated;

REVOKE ALL ON video_assets, clip_jobs, transcripts, transcript_segments, shot_changes,
  clip_candidates, clip_decisions, clip_renders FROM anon;

-- ---------------------------------------------------------------------------
-- RPC do editor: decidir um candidato (atómico: decisão + estado + render)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION decide_clip_candidate(
  p_candidate_id UUID,
  p_decision clip_decision_kind,
  p_reason TEXT DEFAULT NULL,
  p_in_sec DOUBLE PRECISION DEFAULT NULL,
  p_out_sec DOUBLE PRECISION DEFAULT NULL,
  p_burn_subtitles BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cand clip_candidates%ROWTYPE;
  v_job_user UUID;
  v_in DOUBLE PRECISION;
  v_out DOUBLE PRECISION;
  v_render_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_cand FROM clip_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT user_id INTO v_job_user FROM clip_jobs WHERE id = v_cand.job_id;
  IF v_job_user IS DISTINCT FROM v_uid AND NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_cand.status <> 'pending' THEN
    RAISE EXCEPTION 'Candidato já decidido (%)', v_cand.status USING ERRCODE = 'check_violation';
  END IF;

  IF p_decision = 'rejected' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Motivo obrigatório para rejeitar' USING ERRCODE = 'check_violation';
  END IF;

  v_in := COALESCE(p_in_sec, v_cand.in_sec);
  v_out := COALESCE(p_out_sec, v_cand.out_sec);
  IF v_in < 0 OR v_out <= v_in THEN
    RAISE EXCEPTION 'Intervalo inválido (% → %)', v_in, v_out USING ERRCODE = 'check_violation';
  END IF;

  UPDATE clip_candidates
  SET status = p_decision::text::clip_candidate_status, in_sec = v_in, out_sec = v_out
  WHERE id = p_candidate_id;

  INSERT INTO clip_decisions (candidate_id, decided_by, decision, reason, in_sec, out_sec)
  VALUES (p_candidate_id, v_uid, p_decision, NULLIF(btrim(COALESCE(p_reason, '')), ''), v_in, v_out);

  IF p_decision = 'approved' THEN
    INSERT INTO clip_renders (candidate_id, requested_by, in_sec, out_sec, burn_subtitles)
    VALUES (p_candidate_id, v_uid, v_in, v_out, COALESCE(p_burn_subtitles, true))
    RETURNING id INTO v_render_id;
  END IF;

  RETURN jsonb_build_object(
    'candidate_id', p_candidate_id,
    'status', p_decision::text,
    'in_sec', v_in,
    'out_sec', v_out,
    'render_id', v_render_id
  );
END;
$$;

REVOKE ALL ON FUNCTION decide_clip_candidate(UUID, clip_decision_kind, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_clip_candidate(UUID, clip_decision_kind, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPCs do worker (service_role): fila com FOR UPDATE SKIP LOCKED + lease
-- ---------------------------------------------------------------------------

-- Apanha o job mais antigo em 'queued' ou 'running' com lease expirado.
CREATE OR REPLACE FUNCTION claim_next_clip_job(p_worker_id TEXT, p_lease_seconds INT DEFAULT 900)
RETURNS SETOF clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM clip_jobs
  WHERE attempts < max_attempts
    AND (
      status = 'queued'
      OR (status = 'running' AND (lease_until IS NULL OR lease_until < now()))
    )
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE clip_jobs
    SET status = 'running',
        attempts = attempts + 1,
        lease_until = now() + make_interval(secs => p_lease_seconds),
        worker_id = p_worker_id,
        started_at = COALESCE(started_at, now()),
        error = NULL,
        error_step = NULL
    WHERE id = v_id
    RETURNING *;
END;
$$;

-- Renova o lease (e opcionalmente o progresso) durante um passo longo. Devolve false se
-- o worker já não detém o job (lease reclamado por outro).
CREATE OR REPLACE FUNCTION heartbeat_clip_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INT DEFAULT 900,
  p_progress INT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE clip_jobs
  SET lease_until = now() + make_interval(secs => p_lease_seconds),
      progress = COALESCE(p_progress, progress)
  WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'running';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Avança o cursor de passo e renova o lease. 'ready' fecha o job como 'done'.
CREATE OR REPLACE FUNCTION complete_clip_job_step(
  p_job_id UUID,
  p_worker_id TEXT,
  p_next_step clip_job_step,
  p_progress INT,
  p_lease_seconds INT DEFAULT 900
)
RETURNS SETOF clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE clip_jobs
    SET step = p_next_step,
        progress = LEAST(GREATEST(p_progress, 0), 100),
        status = CASE WHEN p_next_step = 'ready' THEN 'done'::clip_job_status ELSE 'running'::clip_job_status END,
        lease_until = CASE WHEN p_next_step = 'ready' THEN NULL ELSE now() + make_interval(secs => p_lease_seconds) END,
        completed_at = CASE WHEN p_next_step = 'ready' THEN now() ELSE NULL END,
        worker_id = CASE WHEN p_next_step = 'ready' THEN NULL ELSE worker_id END,
        error = NULL,
        error_step = NULL
    WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'running'
    RETURNING *;
END;
$$;

-- Falha: volta a 'queued' enquanto houver tentativas (se retryable), senão 'failed'.
CREATE OR REPLACE FUNCTION fail_clip_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT true
)
RETURNS SETOF clip_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE clip_jobs
    SET status = CASE
          WHEN p_retryable AND attempts < max_attempts THEN 'queued'::clip_job_status
          ELSE 'failed'::clip_job_status
        END,
        error = left(p_error, 4000),
        error_step = step,
        lease_until = NULL,
        worker_id = NULL,
        completed_at = CASE
          WHEN p_retryable AND attempts < max_attempts THEN NULL
          ELSE now()
        END
    WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'running'
    RETURNING *;
END;
$$;

-- Libertação voluntária (SIGTERM): volta a 'queued' sem gastar uma tentativa.
CREATE OR REPLACE FUNCTION release_clip_job(p_job_id UUID, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE clip_jobs
  SET status = 'queued',
      attempts = GREATEST(attempts - 1, 0),
      lease_until = NULL,
      worker_id = NULL
  WHERE id = p_job_id AND worker_id = p_worker_id AND status = 'running';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Fila de renders
CREATE OR REPLACE FUNCTION claim_next_clip_render(p_worker_id TEXT, p_lease_seconds INT DEFAULT 900)
RETURNS SETOF clip_renders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM clip_renders
  WHERE attempts < max_attempts
    AND (
      status = 'queued'
      OR (status = 'running' AND (lease_until IS NULL OR lease_until < now()))
    )
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    UPDATE clip_renders
    SET status = 'running',
        attempts = attempts + 1,
        lease_until = now() + make_interval(secs => p_lease_seconds),
        worker_id = p_worker_id,
        error = NULL
    WHERE id = v_id
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION heartbeat_clip_render(p_render_id UUID, p_worker_id TEXT, p_lease_seconds INT DEFAULT 900)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE clip_renders
  SET lease_until = now() + make_interval(secs => p_lease_seconds)
  WHERE id = p_render_id AND worker_id = p_worker_id AND status = 'running';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION complete_clip_render(
  p_render_id UUID,
  p_worker_id TEXT,
  p_storage_path TEXT,
  p_duration_sec DOUBLE PRECISION,
  p_size_bytes BIGINT
)
RETURNS SETOF clip_renders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE clip_renders
    SET status = 'done',
        storage_path = p_storage_path,
        duration_sec = p_duration_sec,
        size_bytes = p_size_bytes,
        lease_until = NULL,
        worker_id = NULL,
        error = NULL,
        completed_at = now()
    WHERE id = p_render_id AND worker_id = p_worker_id AND status = 'running'
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION fail_clip_render(
  p_render_id UUID,
  p_worker_id TEXT,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT true
)
RETURNS SETOF clip_renders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE clip_renders
    SET status = CASE
          WHEN p_retryable AND attempts < max_attempts THEN 'queued'::clip_render_status
          ELSE 'failed'::clip_render_status
        END,
        error = left(p_error, 4000),
        lease_until = NULL,
        worker_id = NULL,
        completed_at = CASE
          WHEN p_retryable AND attempts < max_attempts THEN NULL
          ELSE now()
        END
    WHERE id = p_render_id AND worker_id = p_worker_id AND status = 'running'
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION release_clip_render(p_render_id UUID, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE clip_renders
  SET status = 'queued',
      attempts = GREATEST(attempts - 1, 0),
      lease_until = NULL,
      worker_id = NULL
  WHERE id = p_render_id AND worker_id = p_worker_id AND status = 'running';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Watchdog (cron Vercel): jobs/renders 'running' com lease expirado voltam a 'queued'
-- (ou passam a 'failed' se já esgotaram tentativas). O claim já reclamaria estes leases;
-- isto garante que a UI não mostra 'running' eternamente quando não há workers.
CREATE OR REPLACE FUNCTION requeue_stale_clip_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs_requeued INT;
  v_jobs_failed INT;
  v_renders_requeued INT;
  v_renders_failed INT;
BEGIN
  UPDATE clip_jobs
  SET status = 'queued', lease_until = NULL, worker_id = NULL,
      error = 'Lease expirado — reposto na fila pelo watchdog'
  WHERE status = 'running' AND lease_until < now() AND attempts < max_attempts;
  GET DIAGNOSTICS v_jobs_requeued = ROW_COUNT;

  UPDATE clip_jobs
  SET status = 'failed', lease_until = NULL, worker_id = NULL, completed_at = now(),
      error_step = step,
      error = format('Lease expirado após %s tentativas', attempts)
  WHERE status = 'running' AND lease_until < now() AND attempts >= max_attempts;
  GET DIAGNOSTICS v_jobs_failed = ROW_COUNT;

  UPDATE clip_renders
  SET status = 'queued', lease_until = NULL, worker_id = NULL,
      error = 'Lease expirado — reposto na fila pelo watchdog'
  WHERE status = 'running' AND lease_until < now() AND attempts < max_attempts;
  GET DIAGNOSTICS v_renders_requeued = ROW_COUNT;

  UPDATE clip_renders
  SET status = 'failed', lease_until = NULL, worker_id = NULL, completed_at = now(),
      error = format('Lease expirado após %s tentativas', attempts)
  WHERE status = 'running' AND lease_until < now() AND attempts >= max_attempts;
  GET DIAGNOSTICS v_renders_failed = ROW_COUNT;

  RETURN jsonb_build_object(
    'jobs_requeued', v_jobs_requeued,
    'jobs_failed', v_jobs_failed,
    'renders_requeued', v_renders_requeued,
    'renders_failed', v_renders_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_next_clip_job(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION heartbeat_clip_job(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_clip_job_step(UUID, TEXT, clip_job_step, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_clip_job(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_clip_job(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_next_clip_render(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION heartbeat_clip_render(UUID, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_clip_render(UUID, TEXT, TEXT, DOUBLE PRECISION, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fail_clip_render(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_clip_render(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION requeue_stale_clip_jobs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION claim_next_clip_job(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_clip_job(UUID, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_clip_job_step(UUID, TEXT, clip_job_step, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_clip_job(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION release_clip_job(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_next_clip_render(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION heartbeat_clip_render(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_clip_render(UUID, TEXT, TEXT, DOUBLE PRECISION, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_clip_render(UUID, TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION release_clip_render(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION requeue_stale_clip_jobs() TO service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado `clips`
-- Layout: {user_id}/{asset_id}/source.<ext> · audio.wav · transcript.json ·
--         frames/{candidate_id}-{n}.jpg · renders/{render_id}.mp4
-- NOTA: o limite efetivo depende do plano Supabase (file_size_limit global do projeto).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('clips', 'clips', false, 5368709120)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "clips_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
-- TUS (resumable) precisa de UPDATE na própria pasta para retomar/upsert.
CREATE POLICY "clips_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "clips_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "clips_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Rate limits por defeito
-- ---------------------------------------------------------------------------
INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/clips/uploads', 10
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/clips/uploads');

INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/clips/jobs', 10
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/clips/jobs');

INSERT INTO rate_limits (user_id, endpoint, requests_per_minute)
SELECT NULL, '/api/clips/decision', 60
WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE user_id IS NULL AND endpoint = '/api/clips/decision');
