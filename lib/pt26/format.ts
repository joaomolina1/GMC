/** Formatação PT-PT partilhada entre o ecrã do pivot e o back-office (sem dependências de DOM). */

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** 27.9 → "27,9"; -37.7 → "−37,7" (sinal menos tipográfico). */
export function formatNumberPt(value: number, decimals: number): string {
  const abs = Math.abs(value).toFixed(decimals).replace(".", ",");
  return (value < 0 ? "−" : "") + abs;
}

/** Variação com sinal explícito: +1.2 → "+1,2"; -0.4 → "−0,4". */
export function formatSignedPt(value: number, decimals: number): string {
  if (value > 0) return "+" + formatNumberPt(value, decimals);
  return formatNumberPt(value, decimals);
}

/** "2026-09-07" → { long: "7 Set 2026", short: "7 Set" } */
export function formatDatePt(iso: string): { long: string; short: string } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { long: iso, short: iso };
  const day = Number(m[3]);
  const month = MONTHS_PT[Number(m[2]) - 1] ?? m[2];
  return { long: `${day} ${month} ${m[1]}`, short: `${day} ${month}` };
}

/** Casas decimais por tipo de pergunta (como no protótipo): inteiros nas percentagens de resposta. */
export function decimalsForKind(kind: string): number {
  return kind === "PARTY" || kind === "RANKING" ? 1 : 0;
}

/** true quando a variação é nula à precisão apresentada ("= semana anterior"). */
export function isFlatDelta(delta: number, decimals: number): boolean {
  return Math.abs(delta) < Math.pow(10, -decimals) / 2;
}
