-- PT26 Tracking Poll — zona de televisão em direto.
-- Sondagem semanal com 8 perguntas fixas; resultados importados de Excel pela produção
-- (back-office, só admins) e mostrados pelo pivot num ecrã tátil (/pt26/live, token na URL).
--
-- Todas as tabelas são exclusivas de administradores (RLS is_admin()). O ecrã do pivot não tem
-- sessão: a API /api/pt26/live valida o token de pt26_settings e lê com o service role.

-- ---------------------------------------------------------------------------
-- Entidades de referência
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pt26_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acronym TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pt26_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  role TEXT,
  kind TEXT NOT NULL DEFAULT 'OTHER' CHECK (kind IN ('PM', 'MINISTER', 'LEADER', 'OTHER')),
  party_id UUID REFERENCES pt26_parties(id) ON DELETE SET NULL,
  -- caminho base no bucket `pt26` (sem sufixo); existem <photo_path>-256.webp e <photo_path>-800.webp
  photo_path TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pt26_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE CHECK (number BETWEEN 1 AND 8),
  title TEXT NOT NULL,
  subtitle TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('PARTY', 'APPROVAL', 'YESNO', 'MINISTER', 'RANKING')),
  sign SMALLINT NOT NULL DEFAULT 1 CHECK (sign IN (1, -1)),
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Semanas, quadros e resultados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pt26_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
  source_file_name TEXT,
  imported_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pt26_quadros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES pt26_weeks(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES pt26_questions(id) ON DELETE RESTRICT,
  idx INT NOT NULL CHECK (idx >= 1),
  title TEXT,
  -- "cara" do quadro (ex.: ministro avaliado na P6)
  person_id UUID REFERENCES pt26_people(id) ON DELETE SET NULL,
  UNIQUE (week_id, question_id, idx)
);
CREATE INDEX IF NOT EXISTS pt26_quadros_week_idx ON pt26_quadros (week_id, question_id, idx);

CREATE TABLE IF NOT EXISTS pt26_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id UUID NOT NULL REFERENCES pt26_quadros(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  value NUMERIC(8, 2) NOT NULL,
  person_id UUID REFERENCES pt26_people(id) ON DELETE SET NULL,
  party_id UUID REFERENCES pt26_parties(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (quadro_id, item_key)
);
CREATE INDEX IF NOT EXISTS pt26_results_quadro_idx ON pt26_results (quadro_id, sort_order);

CREATE TABLE IF NOT EXISTS pt26_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID REFERENCES pt26_weeks(id) ON DELETE SET NULL,
  week_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('COMMITTED', 'FAILED')),
  report JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pt26_import_logs_week_idx ON pt26_import_logs (week_date DESC, created_at DESC);

-- Pré-visualização de import (upload → rever → confirmar). Expira ao fim de 2 h.
CREATE TABLE IF NOT EXISTS pt26_import_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  report JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 hours'
);

-- Definições (linha única)
CREATE TABLE IF NOT EXISTS pt26_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  live_token TEXT,
  footer_text TEXT,
  logo_year TEXT NOT NULL DEFAULT '26',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER pt26_parties_updated_at BEFORE UPDATE ON pt26_parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pt26_people_updated_at BEFORE UPDATE ON pt26_people
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pt26_questions_updated_at BEFORE UPDATE ON pt26_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pt26_weeks_updated_at BEFORE UPDATE ON pt26_weeks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER pt26_settings_updated_at BEFORE UPDATE ON pt26_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Import atómico: substitui todos os quadros/resultados de uma semana numa transação.
-- p_payload: { date, label?, source_file_name?, quadros: [ { question_number, idx, title?, person_id?,
--              results: [ { item_key, value, person_id?, party_id?, sort_order } ] } ] }
-- p_keep_status = false → a semana volta a DRAFT (import); true → mantém (edição manual).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pt26_replace_week(p_payload JSONB, p_keep_status BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_date DATE := (p_payload->>'date')::date;
  v_week_id UUID;
  v_q JSONB;
  v_r JSONB;
  v_question_id UUID;
  v_quadro_id UUID;
  v_has_file BOOLEAN := p_payload ? 'source_file_name';
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'date em falta';
  END IF;

  SELECT id INTO v_week_id FROM pt26_weeks WHERE date = v_date;
  IF v_week_id IS NOT NULL THEN
    UPDATE pt26_weeks SET
      label = COALESCE(NULLIF(p_payload->>'label', ''), label),
      source_file_name = CASE WHEN v_has_file THEN p_payload->>'source_file_name' ELSE source_file_name END,
      imported_at = CASE WHEN v_has_file THEN now() ELSE imported_at END,
      status = CASE WHEN p_keep_status THEN status ELSE 'DRAFT' END,
      published_at = CASE WHEN p_keep_status THEN published_at ELSE NULL END
    WHERE id = v_week_id;
    DELETE FROM pt26_quadros WHERE week_id = v_week_id;
  ELSE
    INSERT INTO pt26_weeks (date, label, source_file_name, imported_at)
    VALUES (
      v_date,
      COALESCE(NULLIF(p_payload->>'label', ''), 'Semana'),
      p_payload->>'source_file_name',
      CASE WHEN v_has_file THEN now() ELSE NULL END
    )
    RETURNING id INTO v_week_id;
  END IF;

  FOR v_q IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'quadros', '[]'::jsonb)) LOOP
    SELECT id INTO v_question_id FROM pt26_questions WHERE number = (v_q->>'question_number')::int;
    IF v_question_id IS NULL THEN
      RAISE EXCEPTION 'pergunta % desconhecida', v_q->>'question_number';
    END IF;
    INSERT INTO pt26_quadros (week_id, question_id, idx, title, person_id)
    VALUES (
      v_week_id,
      v_question_id,
      COALESCE((v_q->>'idx')::int, 1),
      NULLIF(v_q->>'title', ''),
      NULLIF(v_q->>'person_id', '')::uuid
    )
    RETURNING id INTO v_quadro_id;

    FOR v_r IN SELECT value FROM jsonb_array_elements(COALESCE(v_q->'results', '[]'::jsonb)) LOOP
      INSERT INTO pt26_results (quadro_id, item_key, value, person_id, party_id, sort_order)
      VALUES (
        v_quadro_id,
        v_r->>'item_key',
        (v_r->>'value')::numeric,
        NULLIF(v_r->>'person_id', '')::uuid,
        NULLIF(v_r->>'party_id', '')::uuid,
        COALESCE((v_r->>'sort_order')::int, 0)
      );
    END LOOP;
  END LOOP;

  RETURN v_week_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pt26_replace_week(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pt26_replace_week(JSONB, BOOLEAN) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS — tudo exclusivo de administradores. O ecrã do pivot lê via service role.
-- ---------------------------------------------------------------------------
ALTER TABLE pt26_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_quadros ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_import_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt26_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt26_parties_admin" ON pt26_parties FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_people_admin" ON pt26_people FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_questions_admin" ON pt26_questions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_weeks_admin" ON pt26_weeks FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_quadros_admin" ON pt26_quadros FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_results_admin" ON pt26_results FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_import_logs_admin" ON pt26_import_logs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_import_previews_admin" ON pt26_import_previews FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "pt26_settings_admin" ON pt26_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

REVOKE TRUNCATE, REFERENCES, TRIGGER ON pt26_parties, pt26_people, pt26_questions, pt26_weeks, pt26_quadros,
  pt26_results, pt26_import_logs, pt26_import_previews, pt26_settings FROM anon, authenticated;
-- Perguntas: só título/subtítulo editáveis; não se criam nem apagam.
REVOKE INSERT, DELETE ON pt26_questions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage — fotografias (WEBP 256/800) e logótipos (leitura pública; escrita só service role)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pt26', 'pt26', true, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pt26_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'pt26');

-- ---------------------------------------------------------------------------
-- Seed — perguntas fixas, partidos e pessoas do protótipo (sem fotos), definições
-- ---------------------------------------------------------------------------
INSERT INTO pt26_questions (number, title, subtitle, kind, sign, sort_order) VALUES
  (1, 'Intenção de voto', NULL, 'PARTY', 1, 1),
  (2, 'Taxa de aprovação do Governo', NULL, 'APPROVAL', 1, 2),
  (3, 'Taxa de aprovação do Primeiro-Ministro', NULL, 'APPROVAL', 1, 3),
  (4, 'O Governo chega ao fim da legislatura?', NULL, 'YESNO', 1, 4),
  (5, 'O Governo merece chegar ao fim da legislatura?', NULL, 'YESNO', 1, 5),
  (6, 'Avaliação do Governo', 'Tem condições para continuar?', 'MINISTER', 1, 6),
  (7, 'Melhores ministros', NULL, 'RANKING', 1, 7),
  (8, 'Piores ministros', NULL, 'RANKING', -1, 8)
ON CONFLICT (number) DO NOTHING;

INSERT INTO pt26_parties (acronym, name, color, sort_order) VALUES
  ('PS', 'Partido Socialista', '#f0568f', 1),
  ('CHEGA', 'Chega', '#5b8cff', 2),
  ('AD', 'Aliança Democrática', '#ff8a1f', 3),
  ('IL', 'Iniciativa Liberal', '#22c8f5', 4),
  ('LIVRE', 'Livre', '#b9e04a', 5),
  ('CDU', 'Coligação Democrática Unitária', '#e63535', 6),
  ('BE', 'Bloco de Esquerda', '#c2185b', 7),
  ('PAN', 'Pessoas–Animais–Natureza', '#2fc9a8', 8),
  ('O/B/N', 'Outros, brancos e nulos', '#8f98b4', 9)
ON CONFLICT (acronym) DO NOTHING;

INSERT INTO pt26_people (name, role, kind, party_id, aliases) VALUES
  ('Luís Montenegro', 'Primeiro-Ministro', 'PM', (SELECT id FROM pt26_parties WHERE acronym = 'AD'), '{}'),
  ('Luís Neves', 'Ministro da Administração Interna', 'MINISTER', NULL, '{}'),
  ('Fernando Alexandre', 'Ministro da Educação', 'MINISTER', NULL, '{}'),
  ('Miranda Sarmento', 'Ministro das Finanças', 'MINISTER', NULL, '{"Joaquim Miranda Sarmento"}'),
  ('Maria da Graça Carvalho', 'Ministra do Ambiente e Energia', 'MINISTER', NULL, '{"Graça Carvalho"}'),
  ('Paulo Rangel', 'Ministro dos Negócios Estrangeiros', 'MINISTER', NULL, '{}'),
  ('Ana Paula Martins', 'Ministra da Saúde', 'MINISTER', NULL, '{}'),
  ('José Luís Carneiro', 'Líder · PS', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'PS'), '{}'),
  ('André Ventura', 'Líder · CHEGA', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'CHEGA'), '{}'),
  ('Mariana Leitão', 'Líder · IL', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'IL'), '{}'),
  ('Rui Tavares', 'Líder · LIVRE', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'LIVRE'), '{}'),
  ('Paulo Raimundo', 'Líder · CDU', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'CDU'), '{}'),
  ('Mariana Mortágua', 'Líder · BE', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'BE'), '{}'),
  ('Inês Sousa Real', 'Líder · PAN', 'LEADER', (SELECT id FROM pt26_parties WHERE acronym = 'PAN'), '{}')
ON CONFLICT (name) DO NOTHING;

-- Token do ecrã do pivot gerado aleatoriamente (visível/regenerável nas Definições do back-office).
INSERT INTO pt26_settings (id, live_token, footer_text, logo_year)
VALUES (1, encode(gen_random_bytes(12), 'hex'), NULL, '26')
ON CONFLICT (id) DO NOTHING;
