import type { HistoryPoint } from "./types";

/** Pontos desenhados. Acima disto a linha fica um borrão e o SVG atrasa o rato. */
export const CHART_POINT_BUDGET = 640;

function peak(point: HistoryPoint): number {
  let max = 0;
  for (const value of Object.values(point.people)) {
    if (value > max) max = value;
  }
  return max;
}

/**
 * Reduz a série para o gráfico sem achatar picos: em cada fatia guarda o vale
 * e o pico (pontos reais, com o seu timestamp), mais o primeiro e o último.
 */
export function decimateHistory(points: HistoryPoint[], maxPoints = CHART_POINT_BUDGET): HistoryPoint[] {
  if (maxPoints < 4 || points.length <= maxPoints) return points;

  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const out: HistoryPoint[] = [];
  const seen = new Set<number>();

  function push(index: number) {
    if (seen.has(index)) return;
    seen.add(index);
    const point = points[index];
    if (point) out.push(point);
  }

  push(0);
  const size = points.length / bucketCount;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor(bucket * size);
    const end = Math.min(points.length - 1, Math.floor((bucket + 1) * size));
    if (end <= start) continue;
    let minIndex = start;
    let maxIndex = start;
    let minValue = peak(points[start]!);
    let maxValue = minValue;
    for (let i = start + 1; i < end; i++) {
      const value = peak(points[i]!);
      if (value < minValue) {
        minValue = value;
        minIndex = i;
      }
      if (value > maxValue) {
        maxValue = value;
        maxIndex = i;
      }
    }
    if (minIndex <= maxIndex) {
      push(minIndex);
      push(maxIndex);
    } else {
      push(maxIndex);
      push(minIndex);
    }
  }
  push(points.length - 1);
  return out;
}
