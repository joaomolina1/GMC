import type { EscalaSettings } from "./types";

export const DEFAULT_SETTINGS: EscalaSettings = {
  maxDiasConsecutivos: 7,
  folgasMinimasPor14Dias: 4,
  janelaFolgasDias: 14,
  descansoMinimoHoras: 12,
  duracaoPadraoTurnoHoras: 7,
  maxHorasSemanais: 35,
  preferirFolgasAgrupadas: false,
};

type SettingsRow = {
  max_dias_consecutivos: number;
  folgas_minimas_por_14_dias: number;
  janela_folgas_dias: number;
  descanso_minimo_horas: number | string;
  duracao_padrao_turno_horas: number | string;
  max_horas_semanais: number | string;
  preferir_folgas_agrupadas: boolean;
};

function num(value: number | string, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function settingsFromRow(row: SettingsRow | null | undefined): EscalaSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    maxDiasConsecutivos: num(row.max_dias_consecutivos, DEFAULT_SETTINGS.maxDiasConsecutivos),
    folgasMinimasPor14Dias: num(row.folgas_minimas_por_14_dias, DEFAULT_SETTINGS.folgasMinimasPor14Dias),
    janelaFolgasDias: num(row.janela_folgas_dias, DEFAULT_SETTINGS.janelaFolgasDias),
    descansoMinimoHoras: num(row.descanso_minimo_horas, DEFAULT_SETTINGS.descansoMinimoHoras),
    duracaoPadraoTurnoHoras: num(row.duracao_padrao_turno_horas, DEFAULT_SETTINGS.duracaoPadraoTurnoHoras),
    maxHorasSemanais: num(row.max_horas_semanais, DEFAULT_SETTINGS.maxHorasSemanais),
    preferirFolgasAgrupadas: Boolean(row.preferir_folgas_agrupadas),
  };
}

export function settingsToRow(settings: EscalaSettings): SettingsRow {
  return {
    max_dias_consecutivos: settings.maxDiasConsecutivos,
    folgas_minimas_por_14_dias: settings.folgasMinimasPor14Dias,
    janela_folgas_dias: settings.janelaFolgasDias,
    descanso_minimo_horas: settings.descansoMinimoHoras,
    duracao_padrao_turno_horas: settings.duracaoPadraoTurnoHoras,
    max_horas_semanais: settings.maxHorasSemanais,
    preferir_folgas_agrupadas: settings.preferirFolgasAgrupadas,
  };
}
