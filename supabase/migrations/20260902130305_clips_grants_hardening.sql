-- Clips — hardening de grants
--
-- O Supabase concede EXECUTE em funções e ALL em tabelas a anon/authenticated/service_role
-- via ALTER DEFAULT PRIVILEGES. `REVOKE ... FROM PUBLIC` (padrão de purge_old_conversations)
-- NÃO remove esses grants explícitos — o advisor de segurança do Supabase assinalou que as RPCs
-- do worker ficaram chamáveis por qualquer utilizador autenticado via /rest/v1/rpc/*.
-- Aqui revogamos explicitamente a anon e authenticated.

-- RPCs exclusivas do worker (service_role) e função de trigger.
-- (Funções de trigger não precisam de EXECUTE no disparo — só na criação do trigger.)
REVOKE EXECUTE ON FUNCTION assert_candidate_approved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_next_clip_job(TEXT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION heartbeat_clip_job(UUID, TEXT, INT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_clip_job_step(UUID, TEXT, clip_job_step, INT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_clip_job(UUID, TEXT, TEXT, BOOLEAN) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_clip_job(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_next_clip_render(TEXT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION heartbeat_clip_render(UUID, TEXT, INT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_clip_render(UUID, TEXT, TEXT, DOUBLE PRECISION, BIGINT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_clip_render(UUID, TEXT, TEXT, BOOLEAN) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_clip_render(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION requeue_stale_clip_jobs() FROM anon, authenticated;

-- RPC do editor: só utilizadores autenticados (a função valida auth.uid()).
REVOKE EXECUTE ON FUNCTION decide_clip_candidate(UUID, clip_decision_kind, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM anon;

-- Tabelas: TRUNCATE ignora RLS; REFERENCES/TRIGGER não têm uso para clientes.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON video_assets, clip_jobs, transcripts, transcript_segments,
  shot_changes, clip_candidates, clip_decisions, clip_renders FROM anon, authenticated;
