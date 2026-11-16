-- =====================================================================
-- Escalas v2 — app autónoma dentro da plataforma GMC.
--
-- 1. Remove o modelo antigo (escala_settings/turnos/membros/...).
-- 2. Plataforma: acesso por funcionalidade (profiles.allowed_features) e
--    mudança de palavra-passe obrigatória (profiles.must_change_password),
--    ambos espelhados em auth.users.raw_app_meta_data para o middleware.
-- 3. Esquema normalizado das escalas, regras rígidas na base de dados,
--    RLS por papel (TRABALHADOR / COORDENADOR / ADMINISTRADOR), bucket privado
--    para comprovativos e configuração inicial (grupos, slots, necessidades,
--    regras e feriados nacionais 2026–2027).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Modelo antigo
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.escala_assignments CASCADE;
DROP TABLE IF EXISTS public.escala_ausencias CASCADE;
DROP TABLE IF EXISTS public.escala_slots CASCADE;
DROP TABLE IF EXISTS public.escala_membros CASCADE;
DROP TABLE IF EXISTS public.escala_turnos CASCADE;
DROP TABLE IF EXISTS public.escala_settings CASCADE;
DROP FUNCTION IF EXISTS public.escala_guard_assignment() CASCADE;
DROP FUNCTION IF EXISTS public.escala_can_read() CASCADE;
DROP FUNCTION IF EXISTS public.escala_is_coordenador() CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 2. Plataforma: acessos por funcionalidade e palavra-passe inicial
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_features TEXT[],
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_allowed_features_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_allowed_features_chk CHECK (
  allowed_features IS NULL
  OR allowed_features <@ ARRAY['agentes', 'flows', 'clips', 'tvibox', 'chartbeat', 'escalas']::TEXT[]
);

COMMENT ON COLUMN public.profiles.allowed_features IS
  'NULL = todas as funcionalidades. Caso contrário, só as listadas (admins não são restringidos).';

-- Só admins (ou o servidor, sem auth.uid()) mudam acessos e a obrigação de mudar a palavra-passe.
CREATE OR REPLACE FUNCTION public.profiles_guard_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('app.conta_bypass', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.allowed_features IS DISTINCT FROM OLD.allowed_features
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
      RAISE EXCEPTION 'Sem permissão para alterar acessos da conta' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_access ON public.profiles;
CREATE TRIGGER profiles_guard_access
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_access();

-- Espelha papel, funcionalidades e obrigação de mudar a palavra-passe no app_metadata
-- (o middleware lê-os do utilizador sem consultar tabelas).
CREATE OR REPLACE FUNCTION public.profiles_sync_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'gmc_role', NEW.role::TEXT,
      'features', to_jsonb(NEW.allowed_features),
      'must_change_password', NEW.must_change_password
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_app_metadata ON public.profiles;
CREATE TRIGGER profiles_sync_app_metadata
  AFTER INSERT OR UPDATE OF role, allowed_features, must_change_password ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_app_metadata();

-- Hash da palavra-passe atribuída pela gestão: só se considera "mudada" quando o hash muda.
CREATE TABLE IF NOT EXISTS public.conta_password_inicial (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conta_password_inicial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conta_password_inicial FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.conta_password_inicial TO service_role;

-- Chamada pelo servidor (service role) depois de definir uma palavra-passe temporária.
CREATE OR REPLACE FUNCTION public.conta_marcar_password_temporaria(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.conta_password_inicial (user_id, hash)
  SELECT id, encrypted_password FROM auth.users WHERE id = p_user_id
  ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, criado_em = now();
  PERFORM set_config('app.conta_bypass', 'on', true);
  UPDATE public.profiles SET must_change_password = true WHERE id = p_user_id;
END;
$$;

-- Chamada pelo próprio utilizador depois de mudar a palavra-passe.
CREATE OR REPLACE FUNCTION public.conta_confirmar_password_alterada()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_hash TEXT;
  v_atual TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT hash INTO v_hash FROM public.conta_password_inicial WHERE user_id = auth.uid();
  SELECT encrypted_password INTO v_atual FROM auth.users WHERE id = auth.uid();
  IF v_hash IS NOT NULL AND v_hash = v_atual THEN
    RETURN false;
  END IF;
  DELETE FROM public.conta_password_inicial WHERE user_id = auth.uid();
  PERFORM set_config('app.conta_bypass', 'on', true);
  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.conta_marcar_password_temporaria(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conta_marcar_password_temporaria(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.conta_confirmar_password_alterada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conta_confirmar_password_alterada() TO authenticated;

-- Preenche o app_metadata dos perfis existentes.
UPDATE public.profiles SET role = role;

-- ---------------------------------------------------------------------
-- 3. Escalas — tipos
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.escala_periodo AS ENUM ('M', 'T', 'N');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_papel AS ENUM ('TRABALHADOR', 'COORDENADOR', 'ADMINISTRADOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_tipo_dia AS ENUM ('SEMANA', 'FDS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_origem AS ENUM ('MANUAL', 'SUGESTAO', 'COPIA', 'MASSA', 'IMPORTACAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_regra AS ENUM
    ('DIAS_SEGUIDOS', 'FOLGAS', 'DESCANSO', 'HORAS', 'SEM_FDS', 'SO_FDS', 'PENDENTE', 'PIQUETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_tipo_ausencia AS ENUM ('INDISPONIBILIDADE', 'BAIXA', 'FERIAS', 'FOLGA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.escala_estado_ausencia AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 4. Escalas — configuração
-- ---------------------------------------------------------------------
CREATE TABLE public.escala_regras (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  descanso_minimo_horas NUMERIC(4, 1) NOT NULL DEFAULT 12 CHECK (descanso_minimo_horas BETWEEN 0 AND 48),
  max_dias_consecutivos INT NOT NULL DEFAULT 7 CHECK (max_dias_consecutivos BETWEEN 1 AND 31),
  folgas_minimas INT NOT NULL DEFAULT 4 CHECK (folgas_minimas BETWEEN 0 AND 31),
  janela_folgas INT NOT NULL DEFAULT 14 CHECK (janela_folgas BETWEEN 1 AND 31),
  max_horas_semanais NUMERIC(5, 1) NOT NULL DEFAULT 40 CHECK (max_horas_semanais BETWEEN 1 AND 168),
  minimo_periodo_so_semana BOOLEAN NOT NULL DEFAULT true,
  fds_folgas_normal INT NOT NULL DEFAULT 2 CHECK (fds_folgas_normal BETWEEN 0 AND 7),
  fds_folgas_sequencia INT NOT NULL DEFAULT 3 CHECK (fds_folgas_sequencia BETWEEN 0 AND 7),
  fds_sequencia_min INT NOT NULL DEFAULT 3 CHECK (fds_sequencia_min BETWEEN 1 AND 52),
  piquete_dias_seguidos INT NOT NULL DEFAULT 7 CHECK (piquete_dias_seguidos BETWEEN 1 AND 31),
  piquete_folgas INT NOT NULL DEFAULT 3 CHECK (piquete_folgas BETWEEN 0 AND 14),
  ferias_dias_ano INT NOT NULL DEFAULT 22 CHECK (ferias_dias_ano BETWEEN 0 AND 60),
  feriado_como_fds BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.escala_periodos (
  codigo public.escala_periodo PRIMARY KEY,
  nome TEXT NOT NULL CHECK (btrim(nome) <> ''),
  ordem INT NOT NULL DEFAULT 0
);

CREATE TABLE public.escala_grupos (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Z0-9_]{2,12}$'),
  nome TEXT NOT NULL CHECK (btrim(nome) <> ''),
  ordem INT NOT NULL DEFAULT 0,
  estimado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.escala_grupo_minimos (
  grupo_id TEXT NOT NULL REFERENCES public.escala_grupos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  periodo public.escala_periodo NOT NULL,
  minimo INT NOT NULL CHECK (minimo BETWEEN 0 AND 99),
  PRIMARY KEY (grupo_id, periodo)
);

CREATE TABLE public.escala_slots (
  id TEXT PRIMARY KEY CHECK (id ~ '^[A-Z0-9_]{1,12}$'),
  etiqueta TEXT NOT NULL CHECK (btrim(etiqueta) <> ''),
  inicio_min INT NOT NULL CHECK (inicio_min BETWEEN 0 AND 1439),
  fim_min INT NOT NULL,
  periodo public.escala_periodo NOT NULL,
  piquete BOOLEAN NOT NULL DEFAULT false,
  nota TEXT NOT NULL DEFAULT '',
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  horas NUMERIC(4, 1) GENERATED ALWAYS AS (round((fim_min - inicio_min) / 60.0, 1)) STORED,
  CHECK (fim_min > inicio_min AND fim_min <= inicio_min + 1440)
);
COMMENT ON COLUMN public.escala_slots.fim_min IS 'Minutos desde as 00:00 do dia do turno; > 1440 termina no dia seguinte.';

CREATE TABLE public.escala_necessidades (
  grupo_id TEXT NOT NULL REFERENCES public.escala_grupos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  slot_id TEXT NOT NULL REFERENCES public.escala_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tipo_dia public.escala_tipo_dia NOT NULL,
  minimo INT NOT NULL CHECK (minimo BETWEEN 0 AND 99),
  maximo INT NOT NULL CHECK (maximo BETWEEN 0 AND 99),
  PRIMARY KEY (grupo_id, slot_id, tipo_dia),
  CHECK (maximo >= minimo)
);

CREATE TABLE public.escala_necessidades_dia (
  data DATE NOT NULL,
  grupo_id TEXT NOT NULL REFERENCES public.escala_grupos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  slot_id TEXT NOT NULL REFERENCES public.escala_slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
  minimo INT NOT NULL CHECK (minimo BETWEEN 0 AND 99),
  maximo INT NOT NULL CHECK (maximo BETWEEN 0 AND 99),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (data, grupo_id, slot_id),
  CHECK (maximo >= minimo)
);

CREATE TABLE public.escala_feriados (
  data DATE PRIMARY KEY,
  nome TEXT NOT NULL CHECK (btrim(nome) <> ''),
  ambito TEXT NOT NULL DEFAULT 'NACIONAL' CHECK (ambito IN ('NACIONAL', 'LOCAL', 'EMPRESA'))
);

-- ---------------------------------------------------------------------
-- 5. Escalas — pessoas
-- ---------------------------------------------------------------------
CREATE TABLE public.escala_pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  nome TEXT NOT NULL CHECK (btrim(nome) <> ''),
  email TEXT,
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  grupo_id TEXT NOT NULL REFERENCES public.escala_grupos(id) ON UPDATE CASCADE,
  papel public.escala_papel NOT NULL DEFAULT 'TRABALHADOR',
  faz_fds BOOLEAN NOT NULL DEFAULT true,
  todos_fds BOOLEAN NOT NULL DEFAULT false,
  so_fds BOOLEAN NOT NULL DEFAULT false,
  integra_grupo_id TEXT REFERENCES public.escala_grupos(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ciclo7 BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  notas TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NULL OR email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  CHECK (NOT todos_fds OR faz_fds),
  CHECK (NOT so_fds OR faz_fds),
  CHECK (integra_grupo_id IS DISTINCT FROM grupo_id)
);
CREATE UNIQUE INDEX escala_pessoas_email_idx ON public.escala_pessoas (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE public.escala_pessoa_periodos (
  pessoa_id UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE CASCADE,
  periodo public.escala_periodo NOT NULL,
  PRIMARY KEY (pessoa_id, periodo)
);

-- Par que não pode folgar/ter férias em simultâneo. Uma linha por par; cada pessoa só num par.
CREATE TABLE public.escala_alternancias (
  pessoa_a UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE CASCADE,
  pessoa_b UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pessoa_a, pessoa_b),
  CHECK (pessoa_a < pessoa_b)
);
CREATE UNIQUE INDEX escala_alternancias_a_idx ON public.escala_alternancias (pessoa_a);
CREATE UNIQUE INDEX escala_alternancias_b_idx ON public.escala_alternancias (pessoa_b);

CREATE OR REPLACE FUNCTION public.escala_alternancia_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.escala_alternancias x
    WHERE (x.pessoa_a, x.pessoa_b) IS DISTINCT FROM (NEW.pessoa_a, NEW.pessoa_b)
      AND (x.pessoa_a IN (NEW.pessoa_a, NEW.pessoa_b) OR x.pessoa_b IN (NEW.pessoa_a, NEW.pessoa_b))
  ) THEN
    RAISE EXCEPTION 'ESCALA:ALTERNANCIA: cada pessoa só pode ter um par de alternância';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER escala_alternancias_guard
  BEFORE INSERT OR UPDATE ON public.escala_alternancias
  FOR EACH ROW EXECUTE FUNCTION public.escala_alternancia_guard();

CREATE TABLE public.escala_ferias_saldo (
  pessoa_id UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE CASCADE,
  ano INT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  dias INT NOT NULL CHECK (dias BETWEEN 0 AND 99),
  PRIMARY KEY (pessoa_id, ano)
);

-- ---------------------------------------------------------------------
-- 6. Escalas — turnos e ausências
-- ---------------------------------------------------------------------
CREATE TABLE public.escala_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  slot_id TEXT NOT NULL REFERENCES public.escala_slots(id) ON UPDATE CASCADE,
  pessoa_id UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE RESTRICT,
  grupo_id TEXT NOT NULL REFERENCES public.escala_grupos(id) ON UPDATE CASCADE,
  origem public.escala_origem NOT NULL DEFAULT 'MANUAL',
  excecao_regras public.escala_regra[] NOT NULL DEFAULT '{}',
  excecao BOOLEAN GENERATED ALWAYS AS (cardinality(excecao_regras) > 0) STORED,
  justificacao TEXT NOT NULL DEFAULT '',
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pessoa_id, data),
  CHECK (cardinality(excecao_regras) = 0 OR btrim(justificacao) <> '')
);
CREATE INDEX escala_turnos_data_idx ON public.escala_turnos (data);
CREATE INDEX escala_turnos_grupo_data_idx ON public.escala_turnos (grupo_id, data);

CREATE TABLE public.escala_ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL REFERENCES public.escala_pessoas(id) ON DELETE RESTRICT,
  tipo public.escala_tipo_ausencia NOT NULL,
  inicio DATE NOT NULL,
  fim DATE NOT NULL,
  estado public.escala_estado_ausencia NOT NULL DEFAULT 'PENDENTE',
  justificacao TEXT NOT NULL DEFAULT '',
  nota_decisao TEXT NOT NULL DEFAULT '',
  excecao TEXT NOT NULL DEFAULT '',
  decidido_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim >= inicio),
  CHECK (fim - inicio <= 400),
  CONSTRAINT escala_ausencias_sem_sobreposicao EXCLUDE USING gist (
    pessoa_id WITH =,
    daterange(inicio, fim, '[]') WITH &&
  ) WHERE (estado = 'APROVADA')
);
CREATE INDEX escala_ausencias_pessoa_idx ON public.escala_ausencias (pessoa_id, inicio);
CREATE INDEX escala_ausencias_estado_idx ON public.escala_ausencias (estado);

CREATE TABLE public.escala_ausencia_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ausencia_id UUID NOT NULL REFERENCES public.escala_ausencias(id) ON DELETE CASCADE,
  caminho TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tamanho BIGINT NOT NULL DEFAULT 0 CHECK (tamanho >= 0),
  tipo TEXT NOT NULL DEFAULT '',
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX escala_ausencia_anexos_ausencia_idx ON public.escala_ausencia_anexos (ausencia_id);

CREATE TABLE public.escala_registo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  em TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  acao TEXT NOT NULL CHECK (btrim(acao) <> ''),
  detalhe TEXT NOT NULL DEFAULT '',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX escala_registo_em_idx ON public.escala_registo (em DESC);

-- ---------------------------------------------------------------------
-- 7. Funções de acesso
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escala_pessoa_atual()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.escala_pessoas WHERE user_id = auth.uid() AND ativo LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.escala_papel_atual()
RETURNS public.escala_papel
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN public.is_admin() THEN 'ADMINISTRADOR'::public.escala_papel
    ELSE (SELECT papel FROM public.escala_pessoas WHERE user_id = auth.uid() AND ativo LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.escala_pode_ler()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.escala_papel_atual() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.escala_is_coord()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.escala_papel_atual() IN ('COORDENADOR', 'ADMINISTRADOR'), false);
$$;

CREATE OR REPLACE FUNCTION public.escala_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.escala_papel_atual() = 'ADMINISTRADOR', false);
$$;

-- ---------------------------------------------------------------------
-- 8. Triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER escala_regras_updated_at BEFORE UPDATE ON public.escala_regras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER escala_pessoas_updated_at BEFORE UPDATE ON public.escala_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER escala_turnos_updated_at BEFORE UPDATE ON public.escala_turnos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER escala_ausencias_updated_at BEFORE UPDATE ON public.escala_ausencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Liga a pessoa à conta da plataforma pelo email; só administradores mudam papel, email e ligação.
CREATE OR REPLACE FUNCTION public.escala_pessoas_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.email := nullif(lower(btrim(coalesce(NEW.email, ''))), '');
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NOT public.escala_is_admin() THEN
    IF NEW.papel IS DISTINCT FROM OLD.papel
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'ESCALA:SO_ADMIN: só a administração altera papel, email ou conta' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NOT public.escala_is_admin()
     AND NEW.papel <> 'TRABALHADOR' THEN
    RAISE EXCEPTION 'ESCALA:SO_ADMIN: só a administração cria coordenadores' USING ERRCODE = '42501';
  END IF;
  IF NEW.email IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email) THEN
    NEW.user_id := (SELECT id FROM public.profiles WHERE lower(email) = NEW.email LIMIT 1);
  ELSIF NEW.email IS NULL THEN
    NEW.user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER escala_pessoas_guard
  BEFORE INSERT OR UPDATE ON public.escala_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.escala_pessoas_guard();

-- Conta criada depois da ficha: liga-a.
CREATE OR REPLACE FUNCTION public.escala_ligar_conta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.escala_pessoas
  SET user_id = NEW.id
  WHERE user_id IS NULL AND email IS NOT NULL AND email = lower(NEW.email);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS escala_ligar_conta ON public.profiles;
CREATE TRIGGER escala_ligar_conta
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.escala_ligar_conta();

-- Regras rígidas de um turno.
CREATE OR REPLACE FUNCTION public.escala_turnos_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pessoa public.escala_pessoas%ROWTYPE;
  v_slot public.escala_slots%ROWTYPE;
  v_aus public.escala_ausencias%ROWTYPE;
BEGIN
  SELECT * INTO v_pessoa FROM public.escala_pessoas WHERE id = NEW.pessoa_id;
  IF NOT FOUND OR NOT v_pessoa.ativo THEN
    RAISE EXCEPTION 'ESCALA_HARD:INATIVA: % não está ativa', coalesce(v_pessoa.nome, 'a pessoa');
  END IF;
  SELECT * INTO v_slot FROM public.escala_slots WHERE id = NEW.slot_id;
  IF NOT FOUND OR (NOT v_slot.ativo AND (TG_OP = 'INSERT' OR NEW.slot_id IS DISTINCT FROM OLD.slot_id)) THEN
    RAISE EXCEPTION 'ESCALA_HARD:SLOT: o slot % não está ativo', NEW.slot_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escala_pessoa_periodos WHERE pessoa_id = NEW.pessoa_id AND periodo = v_slot.periodo
  ) THEN
    RAISE EXCEPTION 'ESCALA_HARD:PERFIL: % não faz o período % (slot %)', v_pessoa.nome, v_slot.periodo, v_slot.etiqueta;
  END IF;
  SELECT * INTO v_aus FROM public.escala_ausencias
  WHERE pessoa_id = NEW.pessoa_id AND estado = 'APROVADA' AND NEW.data BETWEEN inicio AND fim
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ESCALA_HARD:AUSENCIA: % tem % aprovada em %', v_pessoa.nome, lower(v_aus.tipo::TEXT), NEW.data;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.grupo_id := coalesce(NEW.grupo_id, v_pessoa.grupo_id);
  END IF;
  NEW.justificacao := btrim(NEW.justificacao);
  RETURN NEW;
END;
$$;
CREATE TRIGGER escala_turnos_guard
  BEFORE INSERT OR UPDATE ON public.escala_turnos
  FOR EACH ROW EXECUTE FUNCTION public.escala_turnos_guard();

-- Pedidos: o trabalhador só cria pedidos seus, pendentes, e só os pode cancelar.
CREATE OR REPLACE FUNCTION public.escala_ausencias_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coord BOOLEAN := auth.uid() IS NULL OR public.escala_is_coord();
BEGIN
  NEW.justificacao := btrim(NEW.justificacao);
  IF NOT v_coord THEN
    IF NEW.pessoa_id IS DISTINCT FROM public.escala_pessoa_atual() THEN
      RAISE EXCEPTION 'ESCALA:PEDIDO: só pode fazer pedidos para si' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.estado <> 'PENDENTE' OR NEW.tipo = 'FOLGA' THEN
        RAISE EXCEPTION 'ESCALA:PEDIDO: pedido inválido' USING ERRCODE = '42501';
      END IF;
      IF NEW.tipo <> 'BAIXA' AND NEW.justificacao = '' THEN
        RAISE EXCEPTION 'ESCALA:PEDIDO: a justificação é obrigatória';
      END IF;
      NEW.nota_decisao := '';
      NEW.excecao := '';
      NEW.decidido_por := NULL;
      NEW.decidido_em := NULL;
      NEW.criado_por := auth.uid();
    ELSE
      IF OLD.estado <> 'PENDENTE' OR NEW.estado <> 'CANCELADA'
         OR (NEW.tipo, NEW.inicio, NEW.fim, NEW.justificacao, NEW.nota_decisao, NEW.excecao, NEW.pessoa_id)
            IS DISTINCT FROM (OLD.tipo, OLD.inicio, OLD.fim, OLD.justificacao, OLD.nota_decisao, OLD.excecao, OLD.pessoa_id) THEN
        RAISE EXCEPTION 'ESCALA:PEDIDO: só pode cancelar pedidos pendentes' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado IN ('APROVADA', 'REJEITADA') THEN
      NEW.decidido_por := coalesce(auth.uid(), NEW.decidido_por);
      NEW.decidido_em := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER escala_ausencias_guard
  BEFORE INSERT OR UPDATE ON public.escala_ausencias
  FOR EACH ROW EXECUTE FUNCTION public.escala_ausencias_guard();

-- Aprovar uma ausência retira, na mesma transação, os turnos que caem nesses dias.
CREATE OR REPLACE FUNCTION public.escala_ausencias_retira_turnos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INT;
  v_dias TEXT;
BEGIN
  IF NEW.estado = 'APROVADA' THEN
    WITH apagados AS (
      DELETE FROM public.escala_turnos
      WHERE pessoa_id = NEW.pessoa_id AND data BETWEEN NEW.inicio AND NEW.fim
      RETURNING data, slot_id
    )
    SELECT count(*), string_agg(to_char(data, 'DD/MM') || ' ' || slot_id, ', ' ORDER BY data)
    INTO v_n, v_dias FROM apagados;
    IF v_n > 0 THEN
      INSERT INTO public.escala_registo (acao, detalhe, dados)
      SELECT 'Turnos retirados por ausência',
             p.nome || ' · ' || v_n || ' turno(s): ' || v_dias,
             jsonb_build_object('ausencia_id', NEW.id, 'pessoa_id', NEW.pessoa_id)
      FROM public.escala_pessoas p WHERE p.id = NEW.pessoa_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER escala_ausencias_retira_turnos
  AFTER INSERT OR UPDATE OF estado, inicio, fim, pessoa_id ON public.escala_ausencias
  FOR EACH ROW EXECUTE FUNCTION public.escala_ausencias_retira_turnos();

-- ---------------------------------------------------------------------
-- 9. RPC
-- ---------------------------------------------------------------------

-- Aplica, numa transação, um lote de remoções e atribuições (já validadas no servidor).
-- p_retirar: [{data, pessoa_id}] · p_atribuir: [{data, slot_id, pessoa_id, origem, excecao_regras[], justificacao}]
CREATE OR REPLACE FUNCTION public.escala_aplicar_turnos(p_retirar JSONB, p_atribuir JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n INT := 0;
  r JSONB;
BEGIN
  IF NOT public.escala_is_coord() THEN
    RAISE EXCEPTION 'ESCALA:SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_retirar, '[]'::jsonb)) LOOP
    DELETE FROM public.escala_turnos
    WHERE pessoa_id = (r->>'pessoa_id')::UUID AND data = (r->>'data')::DATE;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_atribuir, '[]'::jsonb)) LOOP
    INSERT INTO public.escala_turnos (data, slot_id, pessoa_id, grupo_id, origem, excecao_regras, justificacao)
    SELECT (r->>'data')::DATE, r->>'slot_id', p.id, p.grupo_id,
           coalesce(nullif(r->>'origem', ''), 'MANUAL')::public.escala_origem,
           coalesce(ARRAY(SELECT jsonb_array_elements_text(r->'excecao_regras'))::public.escala_regra[], '{}'),
           coalesce(r->>'justificacao', '')
    FROM public.escala_pessoas p WHERE p.id = (r->>'pessoa_id')::UUID
    ON CONFLICT (pessoa_id, data) DO UPDATE SET
      slot_id = EXCLUDED.slot_id,
      grupo_id = EXCLUDED.grupo_id,
      origem = EXCLUDED.origem,
      excecao_regras = EXCLUDED.excecao_regras,
      justificacao = EXCLUDED.justificacao,
      criado_por = auth.uid();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_aplicar_turnos(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_aplicar_turnos(JSONB, JSONB) TO authenticated, service_role;

-- Informação da alternância para o próprio trabalhador, sem expor as ausências do par.
CREATE OR REPLACE FUNCTION public.escala_minha_alternancia(p_inicio DATE DEFAULT NULL, p_fim DATE DEFAULT NULL)
RETURNS TABLE (par_nome TEXT, par_ausente BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eu AS (SELECT public.escala_pessoa_atual() AS id),
  par AS (
    SELECT CASE WHEN a.pessoa_a = eu.id THEN a.pessoa_b ELSE a.pessoa_a END AS id
    FROM public.escala_alternancias a, eu
    WHERE eu.id IN (a.pessoa_a, a.pessoa_b)
  )
  SELECT p.nome,
         CASE WHEN p_inicio IS NULL THEN false ELSE EXISTS (
           SELECT 1 FROM public.escala_ausencias x
           WHERE x.pessoa_id = p.id AND x.estado IN ('PENDENTE', 'APROVADA')
             AND daterange(x.inicio, x.fim, '[]') && daterange(p_inicio, coalesce(p_fim, p_inicio), '[]')
         ) END
  FROM par JOIN public.escala_pessoas p ON p.id = par.id;
$$;
REVOKE ALL ON FUNCTION public.escala_minha_alternancia(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_minha_alternancia(DATE, DATE) TO authenticated;

-- Grava a ficha de uma pessoa (dados, períodos, saldo de férias do ano e par de alternância) numa transação.
CREATE OR REPLACE FUNCTION public.escala_guardar_pessoa(p JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := nullif(p->>'id', '')::UUID;
  v_alt UUID := nullif(p->>'alterna_com', '')::UUID;
  v_ano INT := coalesce((p->>'ano')::INT, extract(year FROM now())::INT);
BEGIN
  IF NOT public.escala_is_coord() THEN
    RAISE EXCEPTION 'ESCALA:SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.escala_pessoas (codigo, nome, email, grupo_id, papel, faz_fds, todos_fds, so_fds,
                                       integra_grupo_id, ciclo7, ativo, notas)
    VALUES (p->>'codigo', btrim(p->>'nome'), nullif(p->>'email', ''), p->>'grupo_id',
            coalesce(nullif(p->>'papel', ''), 'TRABALHADOR')::public.escala_papel,
            coalesce((p->>'faz_fds')::BOOLEAN, true), coalesce((p->>'todos_fds')::BOOLEAN, false),
            coalesce((p->>'so_fds')::BOOLEAN, false), nullif(p->>'integra_grupo_id', ''),
            coalesce((p->>'ciclo7')::BOOLEAN, false), coalesce((p->>'ativo')::BOOLEAN, true),
            coalesce(p->>'notas', ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.escala_pessoas SET
      nome = btrim(p->>'nome'),
      email = CASE WHEN p ? 'email' THEN nullif(p->>'email', '') ELSE email END,
      grupo_id = p->>'grupo_id',
      papel = CASE WHEN p ? 'papel' THEN (p->>'papel')::public.escala_papel ELSE papel END,
      faz_fds = coalesce((p->>'faz_fds')::BOOLEAN, faz_fds),
      todos_fds = coalesce((p->>'todos_fds')::BOOLEAN, todos_fds),
      so_fds = coalesce((p->>'so_fds')::BOOLEAN, so_fds),
      integra_grupo_id = nullif(p->>'integra_grupo_id', ''),
      ciclo7 = coalesce((p->>'ciclo7')::BOOLEAN, ciclo7),
      ativo = coalesce((p->>'ativo')::BOOLEAN, ativo),
      notas = coalesce(p->>'notas', notas)
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ESCALA:PESSOA_INEXISTENTE';
    END IF;
  END IF;

  IF p ? 'periodos' THEN
    DELETE FROM public.escala_pessoa_periodos WHERE pessoa_id = v_id;
    INSERT INTO public.escala_pessoa_periodos (pessoa_id, periodo)
    SELECT DISTINCT v_id, x::public.escala_periodo FROM jsonb_array_elements_text(p->'periodos') x;
  END IF;

  IF p ? 'ferias_dias' AND p->>'ferias_dias' IS NOT NULL THEN
    INSERT INTO public.escala_ferias_saldo (pessoa_id, ano, dias)
    VALUES (v_id, v_ano, (p->>'ferias_dias')::INT)
    ON CONFLICT (pessoa_id, ano) DO UPDATE SET dias = EXCLUDED.dias;
  END IF;

  IF p ? 'alterna_com' THEN
    DELETE FROM public.escala_alternancias WHERE v_id IN (pessoa_a, pessoa_b);
    IF v_alt IS NOT NULL AND v_alt <> v_id THEN
      DELETE FROM public.escala_alternancias WHERE v_alt IN (pessoa_a, pessoa_b);
      INSERT INTO public.escala_alternancias (pessoa_a, pessoa_b)
      VALUES (least(v_id, v_alt), greatest(v_id, v_alt));
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_guardar_pessoa(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_guardar_pessoa(JSONB) TO authenticated, service_role;

-- Grava a configuração completa (regras, períodos, grupos, mínimos, slots, necessidades) numa transação.
CREATE OR REPLACE FUNCTION public.escala_guardar_config(c JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r JSONB;
BEGIN
  IF NOT public.escala_is_coord() THEN
    RAISE EXCEPTION 'ESCALA:SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;

  IF c ? 'regras' THEN
    r := c->'regras';
    UPDATE public.escala_regras SET
      descanso_minimo_horas = (r->>'descansoMinimoHoras')::NUMERIC,
      max_dias_consecutivos = (r->>'maxDiasConsecutivos')::INT,
      folgas_minimas = (r->>'folgasMinimas')::INT,
      janela_folgas = (r->>'janelaFolgas')::INT,
      max_horas_semanais = (r->>'maxHorasSemanais')::NUMERIC,
      minimo_periodo_so_semana = (r->>'minimoPeriodoSoSemana')::BOOLEAN,
      fds_folgas_normal = (r->>'fdsFolgasNormal')::INT,
      fds_folgas_sequencia = (r->>'fdsFolgasSequencia')::INT,
      fds_sequencia_min = (r->>'fdsSequenciaMin')::INT,
      piquete_dias_seguidos = (r->>'piqueteDiasSeguidos')::INT,
      piquete_folgas = (r->>'piqueteFolgas')::INT,
      ferias_dias_ano = (r->>'feriasDiasAno')::INT,
      feriado_como_fds = (r->>'feriadoComoFds')::BOOLEAN,
      updated_by = auth.uid()
    WHERE id = 1;
  END IF;

  IF c ? 'periodos' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(c->'periodos') LOOP
      UPDATE public.escala_periodos SET nome = r->>'nome' WHERE codigo = (r->>'codigo')::public.escala_periodo;
    END LOOP;
  END IF;

  IF c ? 'grupos' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(c->'grupos') LOOP
      INSERT INTO public.escala_grupos (id, nome, ordem, estimado, ativo)
      VALUES (r->>'id', r->>'nome', coalesce((r->>'ordem')::INT, 0), coalesce((r->>'estimado')::BOOLEAN, false),
              coalesce((r->>'ativo')::BOOLEAN, true))
      ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem,
        estimado = EXCLUDED.estimado, ativo = EXCLUDED.ativo;
      DELETE FROM public.escala_grupo_minimos WHERE grupo_id = r->>'id';
      INSERT INTO public.escala_grupo_minimos (grupo_id, periodo, minimo)
      SELECT r->>'id', k::public.escala_periodo, (v #>> '{}')::INT
      FROM jsonb_each(coalesce(r->'minimos', '{}'::jsonb)) AS m(k, v)
      WHERE (v #>> '{}')::INT > 0;
    END LOOP;
  END IF;

  IF c ? 'slots' THEN
    FOR r IN SELECT * FROM jsonb_array_elements(c->'slots') LOOP
      INSERT INTO public.escala_slots (id, etiqueta, inicio_min, fim_min, periodo, piquete, nota, ordem, ativo)
      VALUES (r->>'id', r->>'etiqueta', (r->>'inicioMin')::INT, (r->>'fimMin')::INT,
              (r->>'periodo')::public.escala_periodo, coalesce((r->>'piquete')::BOOLEAN, false),
              coalesce(r->>'nota', ''), coalesce((r->>'ordem')::INT, 0), coalesce((r->>'ativo')::BOOLEAN, true))
      ON CONFLICT (id) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, inicio_min = EXCLUDED.inicio_min,
        fim_min = EXCLUDED.fim_min, periodo = EXCLUDED.periodo, piquete = EXCLUDED.piquete,
        nota = EXCLUDED.nota, ordem = EXCLUDED.ordem, ativo = EXCLUDED.ativo;
    END LOOP;
  END IF;

  IF c ? 'necessidades' THEN
    DELETE FROM public.escala_necessidades;
    INSERT INTO public.escala_necessidades (grupo_id, slot_id, tipo_dia, minimo, maximo)
    SELECT x->>'grupoId', x->>'slotId', (x->>'tipoDia')::public.escala_tipo_dia,
           (x->>'minimo')::INT, (x->>'maximo')::INT
    FROM jsonb_array_elements(c->'necessidades') x
    WHERE (x->>'minimo')::INT > 0 OR (x->>'maximo')::INT > 0;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.escala_guardar_config(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escala_guardar_config(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.escala_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_grupo_minimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_necessidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_necessidades_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_pessoa_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_alternancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_ferias_saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_ausencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_ausencia_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escala_registo ENABLE ROW LEVEL SECURITY;

-- Configuração: todos os membros leem; coordenação escreve.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['escala_regras', 'escala_periodos', 'escala_grupos', 'escala_grupo_minimos',
                           'escala_slots', 'escala_necessidades', 'escala_necessidades_dia', 'escala_feriados']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.escala_pode_ler())', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord())', t || '_write', t);
  END LOOP;
END $$;

-- Pessoas: coordenação vê todas; o trabalhador só a sua ficha.
CREATE POLICY escala_pessoas_select ON public.escala_pessoas FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR user_id = auth.uid());
CREATE POLICY escala_pessoas_insert ON public.escala_pessoas FOR INSERT TO authenticated
  WITH CHECK (public.escala_is_coord());
CREATE POLICY escala_pessoas_update ON public.escala_pessoas FOR UPDATE TO authenticated
  USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord());
CREATE POLICY escala_pessoas_delete ON public.escala_pessoas FOR DELETE TO authenticated
  USING (public.escala_is_admin());

CREATE POLICY escala_pessoa_periodos_select ON public.escala_pessoa_periodos FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_pessoa_periodos_write ON public.escala_pessoa_periodos FOR ALL TO authenticated
  USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord());

CREATE POLICY escala_ferias_saldo_select ON public.escala_ferias_saldo FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_ferias_saldo_write ON public.escala_ferias_saldo FOR ALL TO authenticated
  USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord());

CREATE POLICY escala_alternancias_select ON public.escala_alternancias FOR SELECT TO authenticated
  USING (public.escala_is_coord());
CREATE POLICY escala_alternancias_write ON public.escala_alternancias FOR ALL TO authenticated
  USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord());

-- Turnos: o trabalhador só vê os seus.
CREATE POLICY escala_turnos_select ON public.escala_turnos FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_turnos_write ON public.escala_turnos FOR ALL TO authenticated
  USING (public.escala_is_coord()) WITH CHECK (public.escala_is_coord());

-- Ausências: o trabalhador cria e cancela as suas (o trigger limita o resto).
CREATE POLICY escala_ausencias_select ON public.escala_ausencias FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_ausencias_insert ON public.escala_ausencias FOR INSERT TO authenticated
  WITH CHECK (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_ausencias_update ON public.escala_ausencias FOR UPDATE TO authenticated
  USING (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual())
  WITH CHECK (public.escala_is_coord() OR pessoa_id = public.escala_pessoa_atual());
CREATE POLICY escala_ausencias_delete ON public.escala_ausencias FOR DELETE TO authenticated
  USING (public.escala_is_coord());

CREATE POLICY escala_ausencia_anexos_select ON public.escala_ausencia_anexos FOR SELECT TO authenticated
  USING (public.escala_is_coord() OR EXISTS (
    SELECT 1 FROM public.escala_ausencias a WHERE a.id = ausencia_id AND a.pessoa_id = public.escala_pessoa_atual()));
CREATE POLICY escala_ausencia_anexos_insert ON public.escala_ausencia_anexos FOR INSERT TO authenticated
  WITH CHECK (public.escala_is_coord() OR EXISTS (
    SELECT 1 FROM public.escala_ausencias a
    WHERE a.id = ausencia_id AND a.pessoa_id = public.escala_pessoa_atual() AND a.estado = 'PENDENTE'));
CREATE POLICY escala_ausencia_anexos_delete ON public.escala_ausencia_anexos FOR DELETE TO authenticated
  USING (public.escala_is_coord());

-- Registo: só a coordenação lê; quem usa a app pode acrescentar em seu nome; ninguém altera.
CREATE POLICY escala_registo_select ON public.escala_registo FOR SELECT TO authenticated
  USING (public.escala_is_coord());
CREATE POLICY escala_registo_insert ON public.escala_registo FOR INSERT TO authenticated
  WITH CHECK (public.escala_pode_ler() AND user_id = auth.uid());

REVOKE ALL ON public.escala_regras, public.escala_periodos, public.escala_grupos, public.escala_grupo_minimos,
  public.escala_slots, public.escala_necessidades, public.escala_necessidades_dia, public.escala_feriados,
  public.escala_pessoas, public.escala_pessoa_periodos, public.escala_alternancias, public.escala_ferias_saldo,
  public.escala_turnos, public.escala_ausencias, public.escala_ausencia_anexos, public.escala_registo
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escala_regras, public.escala_periodos, public.escala_grupos,
  public.escala_grupo_minimos, public.escala_slots, public.escala_necessidades, public.escala_necessidades_dia,
  public.escala_feriados, public.escala_pessoas, public.escala_pessoa_periodos, public.escala_alternancias,
  public.escala_ferias_saldo, public.escala_turnos, public.escala_ausencias, public.escala_ausencia_anexos
  TO authenticated;
GRANT SELECT, INSERT ON public.escala_registo TO authenticated;
GRANT ALL ON public.escala_regras, public.escala_periodos, public.escala_grupos, public.escala_grupo_minimos,
  public.escala_slots, public.escala_necessidades, public.escala_necessidades_dia, public.escala_feriados,
  public.escala_pessoas, public.escala_pessoa_periodos, public.escala_alternancias, public.escala_ferias_saldo,
  public.escala_turnos, public.escala_ausencias, public.escala_ausencia_anexos, public.escala_registo
  TO service_role;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['escala_pessoa_atual()', 'escala_papel_atual()', 'escala_pode_ler()',
                           'escala_is_coord()', 'escala_is_admin()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 11. Storage: comprovativos (privado). Caminho: <pessoa_id>/<ausencia_id>/<ficheiro>
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('escalas-comprovativos', 'escalas-comprovativos', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY escalas_comprovativos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'escalas-comprovativos' AND (
    public.escala_is_coord() OR (storage.foldername(name))[1] = public.escala_pessoa_atual()::TEXT));
CREATE POLICY escalas_comprovativos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'escalas-comprovativos' AND (
    public.escala_is_coord() OR (storage.foldername(name))[1] = public.escala_pessoa_atual()::TEXT));
CREATE POLICY escalas_comprovativos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'escalas-comprovativos' AND public.escala_is_coord());

-- ---------------------------------------------------------------------
-- 12. Tempo real
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.escala_turnos, public.escala_ausencias,
      public.escala_necessidades_dia;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 13. Configuração inicial (documento HORÁRIOS; pessoas carregadas à parte)
-- ---------------------------------------------------------------------
INSERT INTO public.escala_regras (id) VALUES (1);

INSERT INTO public.escala_periodos (codigo, nome, ordem) VALUES
  ('M', 'Manhã', 1), ('T', 'Tarde', 2), ('N', 'Noite', 3);

INSERT INTO public.escala_grupos (id, nome, ordem, estimado) VALUES
  ('RED', 'Redação', 1, false),
  ('CHE', 'Chefes', 2, true),
  ('COO', 'Coordenadores', 3, true),
  ('PIV', 'Pivots', 4, true),
  ('PRO', 'Produção', 5, true);

INSERT INTO public.escala_grupo_minimos (grupo_id, periodo, minimo) VALUES
  ('RED', 'M', 3), ('RED', 'T', 2);

INSERT INTO public.escala_slots (id, etiqueta, inicio_min, fim_min, periodo, piquete, nota, ordem) VALUES
  ('S1', '07–15', 420, 900, 'M', false, '', 1),
  ('S2', '08–16', 480, 960, 'M', false, '', 2),
  ('S3', '09–17', 540, 1020, 'M', false, '', 3),
  ('S4', '10–18', 600, 1080, 'T', false, '', 4),
  ('S5', '13–21', 780, 1260, 'T', false, '', 5),
  ('S6', '14–22', 840, 1320, 'T', false, '', 6),
  ('S7', '16–00', 960, 1440, 'N', true, 'Piquete ao fim de semana', 7),
  ('S8', '17–01', 1020, 1500, 'N', true, 'Piquete à semana', 8);

INSERT INTO public.escala_necessidades (grupo_id, slot_id, tipo_dia, minimo, maximo) VALUES
  ('RED', 'S1', 'SEMANA', 1, 1), ('RED', 'S2', 'SEMANA', 1, 1), ('RED', 'S3', 'SEMANA', 1, 1),
  ('RED', 'S4', 'SEMANA', 1, 2), ('RED', 'S5', 'SEMANA', 1, 2), ('RED', 'S8', 'SEMANA', 1, 1),
  ('RED', 'S2', 'FDS', 1, 1), ('RED', 'S4', 'FDS', 1, 1), ('RED', 'S7', 'FDS', 1, 1),
  ('CHE', 'S1', 'SEMANA', 1, 1), ('CHE', 'S5', 'SEMANA', 1, 1), ('CHE', 'S4', 'FDS', 1, 1),
  ('COO', 'S1', 'SEMANA', 1, 1), ('COO', 'S7', 'SEMANA', 1, 1), ('COO', 'S1', 'FDS', 1, 1),
  ('PIV', 'S2', 'SEMANA', 1, 1), ('PIV', 'S7', 'SEMANA', 1, 1), ('PIV', 'S4', 'FDS', 1, 1),
  ('PRO', 'S1', 'SEMANA', 1, 1), ('PRO', 'S7', 'SEMANA', 1, 1);

-- Feriados nacionais obrigatórios (Código do Trabalho, art. 234.º).
INSERT INTO public.escala_feriados (data, nome) VALUES
  ('2026-01-01', 'Ano Novo'),
  ('2026-04-03', 'Sexta-feira Santa'),
  ('2026-04-05', 'Páscoa'),
  ('2026-04-25', 'Dia da Liberdade'),
  ('2026-05-01', 'Dia do Trabalhador'),
  ('2026-06-04', 'Corpo de Deus'),
  ('2026-06-10', 'Dia de Portugal'),
  ('2026-08-15', 'Assunção de Nossa Senhora'),
  ('2026-10-05', 'Implantação da República'),
  ('2026-11-01', 'Dia de Todos os Santos'),
  ('2026-12-01', 'Restauração da Independência'),
  ('2026-12-08', 'Imaculada Conceição'),
  ('2026-12-25', 'Natal'),
  ('2027-01-01', 'Ano Novo'),
  ('2027-03-26', 'Sexta-feira Santa'),
  ('2027-03-28', 'Páscoa'),
  ('2027-04-25', 'Dia da Liberdade'),
  ('2027-05-01', 'Dia do Trabalhador'),
  ('2027-05-27', 'Corpo de Deus'),
  ('2027-06-10', 'Dia de Portugal'),
  ('2027-08-15', 'Assunção de Nossa Senhora'),
  ('2027-10-05', 'Implantação da República'),
  ('2027-11-01', 'Dia de Todos os Santos'),
  ('2027-12-01', 'Restauração da Independência'),
  ('2027-12-08', 'Imaculada Conceição'),
  ('2027-12-25', 'Natal');

INSERT INTO public.escala_registo (acao, detalhe)
VALUES ('Estrutura base criada', 'Grupos, slots, necessidades, regras e feriados nacionais 2026–2027');
