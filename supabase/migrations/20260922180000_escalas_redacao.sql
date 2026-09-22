-- Escalas da redação.
-- Regras SOFT (descanso, folgas, dias consecutivos, horas) avisam e podem ser
-- forçadas com justificação. Regras HARD ficam também na base: o turno tem de
-- caber no perfil, não pode cair em férias/ausência aprovada, e só há um turno
-- por jornalista e por dia.

CREATE TABLE escala_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_dias_consecutivos INT NOT NULL DEFAULT 7 CHECK (max_dias_consecutivos BETWEEN 1 AND 14),
  folgas_minimas_por_14_dias INT NOT NULL DEFAULT 4 CHECK (folgas_minimas_por_14_dias BETWEEN 0 AND 14),
  janela_folgas_dias INT NOT NULL DEFAULT 14 CHECK (janela_folgas_dias BETWEEN 7 AND 28),
  descanso_minimo_horas NUMERIC(4, 1) NOT NULL DEFAULT 12 CHECK (descanso_minimo_horas >= 0),
  duracao_padrao_turno_horas NUMERIC(4, 1) NOT NULL DEFAULT 7 CHECK (duracao_padrao_turno_horas > 0),
  max_horas_semanais NUMERIC(5, 1) NOT NULL DEFAULT 35 CHECK (max_horas_semanais > 0),
  preferir_folgas_agrupadas BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);

INSERT INTO escala_settings (id) VALUES (1);

CREATE TABLE escala_turnos (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  inicio TIME NOT NULL,
  fim TIME NOT NULL,
  atravessa_meia_noite BOOLEAN NOT NULL DEFAULT false,
  ordem INT NOT NULL DEFAULT 0
);

INSERT INTO escala_turnos (codigo, nome, inicio, fim, atravessa_meia_noite, ordem) VALUES
  ('S1', 'Manhã', '07:00', '14:00', false, 1),
  ('S2', 'Manhã tardia', '09:00', '16:00', false, 2),
  ('S3', 'Tarde', '11:00', '18:00', false, 3),
  ('S4', 'Tarde tardia', '13:00', '20:00', false, 4),
  ('S5', 'Noite', '15:00', '22:00', false, 5),
  ('S6', 'Fecho', '17:00', '02:00', true, 6);

CREATE TABLE escala_membros (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('jornalista', 'coordenador')),
  turnos_permitidos TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE escala_ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ferias', 'ausencia')),
  estado TEXT NOT NULL DEFAULT 'aprovada' CHECK (estado IN ('pendente', 'aprovada', 'rejeitada')),
  nota TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, data)
);

CREATE TABLE escala_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno TEXT NOT NULL REFERENCES escala_turnos(codigo),
  excecao BOOLEAN NOT NULL DEFAULT false,
  excecao_codigos TEXT[] NOT NULL DEFAULT '{}'
    CHECK (
      excecao_codigos <@ ARRAY[
        'MAX_DIAS_CONSECUTIVOS',
        'FOLGAS_INSUFICIENTES',
        'DESCANSO_INSUFICIENTE',
        'HORAS_SEMANAIS'
      ]::text[]
    ),
  excecao_justificacao TEXT,
  excecao_autorizada_por UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, data)
);

CREATE INDEX escala_assignments_data_idx ON escala_assignments (data);
CREATE INDEX escala_ausencias_data_idx ON escala_ausencias (data);

CREATE TABLE escala_slots (
  data DATE NOT NULL,
  turno TEXT NOT NULL REFERENCES escala_turnos(codigo),
  quantidade INT NOT NULL DEFAULT 1 CHECK (quantidade >= 0),
  PRIMARY KEY (data, turno)
);

CREATE OR REPLACE FUNCTION public.escala_can_read()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.escala_membros m
      WHERE m.user_id = auth.uid() AND m.ativo
    );
$$;

CREATE OR REPLACE FUNCTION public.escala_is_coordenador()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.escala_membros m
      WHERE m.user_id = auth.uid()
        AND m.papel = 'coordenador'
        AND m.ativo
    );
$$;

CREATE OR REPLACE FUNCTION public.escala_guard_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membro public.escala_membros%ROWTYPE;
BEGIN
  SELECT * INTO membro
  FROM public.escala_membros
  WHERE user_id = NEW.user_id AND ativo AND papel = 'jornalista';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESCALA_HARD:FORA_DO_PERFIL: sem perfil de jornalista ativo';
  END IF;

  IF NOT (NEW.turno = ANY (membro.turnos_permitidos)) THEN
    RAISE EXCEPTION 'ESCALA_HARD:FORA_DO_PERFIL: turno % fora do perfil', NEW.turno;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.escala_ausencias
    WHERE user_id = NEW.user_id AND data = NEW.data AND estado = 'aprovada'
  ) THEN
    RAISE EXCEPTION 'ESCALA_HARD:AUSENCIA_APROVADA: férias ou ausência aprovada em %', NEW.data;
  END IF;

  IF NEW.excecao THEN
    IF NEW.excecao_justificacao IS NULL OR btrim(NEW.excecao_justificacao) = '' THEN
      RAISE EXCEPTION 'ESCALA_SOFT:JUSTIFICACAO_OBRIGATORIA: a exceção precisa de justificação';
    END IF;
    IF NEW.excecao_autorizada_por IS NULL THEN
      RAISE EXCEPTION 'ESCALA_SOFT:AUTOR_OBRIGATORIO: a exceção precisa de autor';
    END IF;
    IF coalesce(array_length(NEW.excecao_codigos, 1), 0) = 0 THEN
      RAISE EXCEPTION 'ESCALA_SOFT:CODIGOS_OBRIGATORIOS: a exceção precisa dos códigos violados';
    END IF;
  ELSE
    NEW.excecao_codigos := '{}';
    NEW.excecao_justificacao := NULL;
    NEW.excecao_autorizada_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER escala_assignments_guard
  BEFORE INSERT OR UPDATE ON escala_assignments
  FOR EACH ROW EXECUTE FUNCTION public.escala_guard_assignment();

CREATE TRIGGER escala_settings_updated_at
  BEFORE UPDATE ON escala_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE escala_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE escala_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY escala_settings_select ON escala_settings
  FOR SELECT TO authenticated USING (public.escala_can_read());
CREATE POLICY escala_settings_write ON escala_settings
  FOR ALL TO authenticated
  USING (public.escala_is_coordenador())
  WITH CHECK (public.escala_is_coordenador());

CREATE POLICY escala_turnos_select ON escala_turnos
  FOR SELECT TO authenticated USING (public.escala_can_read());

CREATE POLICY escala_membros_select ON escala_membros
  FOR SELECT TO authenticated USING (public.escala_can_read());
CREATE POLICY escala_membros_write ON escala_membros
  FOR ALL TO authenticated
  USING (public.escala_is_coordenador())
  WITH CHECK (public.escala_is_coordenador());

CREATE POLICY escala_ausencias_select ON escala_ausencias
  FOR SELECT TO authenticated USING (public.escala_can_read());
CREATE POLICY escala_ausencias_write ON escala_ausencias
  FOR ALL TO authenticated
  USING (public.escala_is_coordenador())
  WITH CHECK (public.escala_is_coordenador());

CREATE POLICY escala_assignments_select ON escala_assignments
  FOR SELECT TO authenticated USING (public.escala_can_read());
CREATE POLICY escala_assignments_write ON escala_assignments
  FOR ALL TO authenticated
  USING (public.escala_is_coordenador())
  WITH CHECK (public.escala_is_coordenador());

CREATE POLICY escala_slots_select ON escala_slots
  FOR SELECT TO authenticated USING (public.escala_can_read());
CREATE POLICY escala_slots_write ON escala_slots
  FOR ALL TO authenticated
  USING (public.escala_is_coordenador())
  WITH CHECK (public.escala_is_coordenador());

REVOKE ALL ON escala_settings, escala_turnos, escala_membros, escala_ausencias, escala_assignments, escala_slots FROM PUBLIC, anon;
GRANT SELECT ON escala_settings, escala_turnos, escala_membros, escala_ausencias, escala_assignments, escala_slots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON escala_settings, escala_membros, escala_ausencias, escala_assignments, escala_slots TO authenticated;
GRANT ALL ON escala_settings, escala_turnos, escala_membros, escala_ausencias, escala_assignments, escala_slots TO service_role;

REVOKE ALL ON FUNCTION public.escala_can_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.escala_is_coordenador() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_can_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escala_is_coordenador() TO authenticated, service_role;
