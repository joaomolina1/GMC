-- TVI BOX — importação de novelas prontas (zip ou MP4s) a partir do Estúdio.
--
-- Fluxo: o admin carrega os ficheiros direto para o bucket privado `tvibox-imports`
-- (TUS resumable, pasta = id do job); o worker `npm run tvibox:import -- --job <id>`
-- descompacta, transcodifica, transcreve, pede a proposta editorial ao modelo e cria a
-- série + episódios como rascunho (status 'review'); o admin publica no Estúdio.

CREATE TABLE IF NOT EXISTS tvibox_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'queued', 'running', 'review', 'published', 'failed', 'cancelled')),
  -- ficheiros carregados: [{ name, path, size, type }]
  files JSONB NOT NULL DEFAULT '[]',
  -- pistas dadas pelo admin (opcionais): { title, slug, publish }
  hints JSONB NOT NULL DEFAULT '{}',
  step TEXT,
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  log TEXT[] NOT NULL DEFAULT '{}',
  proposal JSONB,
  series_id UUID REFERENCES tvibox_series(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tvibox_import_jobs_status_idx ON tvibox_import_jobs (status, created_at DESC);

CREATE TRIGGER tvibox_import_jobs_updated_at BEFORE UPDATE ON tvibox_import_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tvibox_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tvibox_import_jobs_admin" ON tvibox_import_jobs FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Bucket privado para os ficheiros de origem (zips grandes; nunca servidos ao público).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tvibox-imports', 'tvibox-imports', false, 5368709120)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tvibox_imports_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tvibox-imports' AND is_admin());
-- TUS (resumable) precisa de UPDATE para retomar/upsert.
CREATE POLICY "tvibox_imports_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tvibox-imports' AND is_admin())
  WITH CHECK (bucket_id = 'tvibox-imports' AND is_admin());
CREATE POLICY "tvibox_imports_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tvibox-imports' AND is_admin());
CREATE POLICY "tvibox_imports_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tvibox-imports' AND is_admin());
