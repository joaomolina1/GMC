import { daysSinceEpoch } from "./dates";
import type { Turno } from "./types";

/** Catálogo base da redação. O S6 é o único que atravessa a meia-noite (9h de relógio). */
export const TURNOS: Turno[] = [
  { code: "S1", nome: "Manhã", inicio: "07:00", fim: "14:00", atravessaMeiaNoite: false, ordem: 1 },
  { code: "S2", nome: "Manhã tardia", inicio: "09:00", fim: "16:00", atravessaMeiaNoite: false, ordem: 2 },
  { code: "S3", nome: "Tarde", inicio: "11:00", fim: "18:00", atravessaMeiaNoite: false, ordem: 3 },
  { code: "S4", nome: "Tarde tardia", inicio: "13:00", fim: "20:00", atravessaMeiaNoite: false, ordem: 4 },
  { code: "S5", nome: "Noite", inicio: "15:00", fim: "22:00", atravessaMeiaNoite: false, ordem: 5 },
  { code: "S6", nome: "Fecho", inicio: "17:00", fim: "02:00", atravessaMeiaNoite: true, ordem: 6 },
];

export function turnoByCode(code: string, catalog: Turno[] = TURNOS): Turno | undefined {
  return catalog.find((t) => t.code === code);
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutos desde a época, em hora de relógio (sem horário de verão). */
export function intervaloTurno(date: string, turno: Turno): { inicio: number; fim: number } {
  const day = daysSinceEpoch(date) * 1440;
  const inicio = day + hhmmToMinutes(turno.inicio);
  let fim = day + hhmmToMinutes(turno.fim);
  if (turno.atravessaMeiaNoite || fim <= inicio) fim += 1440;
  return { inicio, fim };
}

/** Duração de relógio. O S6 devolve 9; a contagem semanal ignora essas horas a mais. */
export function duracaoRelogioHoras(turno: Turno): number {
  const { inicio, fim } = intervaloTurno("2026-01-01", turno);
  return (fim - inicio) / 60;
}

export function horasContadas(settings: { duracaoPadraoTurnoHoras: number }): number {
  return settings.duracaoPadraoTurnoHoras;
}
