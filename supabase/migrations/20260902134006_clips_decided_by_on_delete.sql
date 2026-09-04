-- Clips — apagar utilizadores com decisões/renders
--
-- `clip_decisions.decided_by` e `clip_renders.requested_by` referenciavam profiles(id) sem
-- ação ON DELETE: apagar um utilizador que tenha aprovado/rejeitado candidatos falhava com
-- "violates foreign key constraint clip_decisions_decided_by_fkey" (bloqueia offboarding/RGPD).
-- O histórico de decisões continua a ser preservado (é o que alimenta a reordenação futura):
-- em vez de apagar a decisão, o autor passa a NULL.

ALTER TABLE clip_decisions ALTER COLUMN decided_by DROP NOT NULL;
ALTER TABLE clip_decisions DROP CONSTRAINT clip_decisions_decided_by_fkey;
ALTER TABLE clip_decisions
  ADD CONSTRAINT clip_decisions_decided_by_fkey
  FOREIGN KEY (decided_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE clip_renders ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE clip_renders DROP CONSTRAINT clip_renders_requested_by_fkey;
ALTER TABLE clip_renders
  ADD CONSTRAINT clip_renders_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
