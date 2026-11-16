-- O Supabase (pg-safeupdate) recusa DELETE sem WHERE, mesmo dentro de funções.
-- Guardar a configuração apagava as necessidades padrão assim e falhava.
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
    DELETE FROM public.escala_necessidades WHERE true;
    INSERT INTO public.escala_necessidades (grupo_id, slot_id, tipo_dia, minimo, maximo)
    SELECT x->>'grupoId', x->>'slotId', (x->>'tipoDia')::public.escala_tipo_dia,
           (x->>'minimo')::INT, (x->>'maximo')::INT
    FROM jsonb_array_elements(c->'necessidades') x
    WHERE (x->>'minimo')::INT > 0 OR (x->>'maximo')::INT > 0;
  END IF;
END;
$$;
