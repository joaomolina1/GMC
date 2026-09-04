/** Regras da economia de moedas TVI BOX (espelham as funções SQL da migração). */

export const WELCOME_COINS = 60;
export const DAILY_REWARD = 20;
export const WEEKLY_BONUS = 50;
export const AD_REWARD = 15;
export const ADS_PER_DAY = 5;
export const DEFAULT_UNLOCK_COST = 15;

export interface CoinPack {
  id: "p60" | "p180" | "p500";
  coins: number;
  bonus: number;
  price: string;
  best?: boolean;
  icon: string;
}

export const PACKS: CoinPack[] = [
  { id: "p60", coins: 60, bonus: 0, price: "2,99€", icon: "🪙" },
  { id: "p180", coins: 180, bonus: 30, price: "6,99€", best: true, icon: "💰" },
  { id: "p500", coins: 500, bonus: 100, price: "14,99€", icon: "💎" },
];

export const PLUS_PRICE = "4,99€/mês";
export const PLUS_TRIAL_DAYS = 7;

export function isPlusActive(plusUntil: string | null | undefined, now: number = Date.now()): boolean {
  if (!plusUntil) return false;
  const t = new Date(plusUntil).getTime();
  return Number.isFinite(t) && t > now;
}

export function unlockCost(
  episode: { is_free: boolean; coin_cost: number },
  plusActive: boolean
): number {
  if (episode.is_free) return 0;
  if (plusActive) return 0;
  return Math.max(0, episode.coin_cost);
}

/** Quantos episódios (ao custo padrão) o saldo desbloqueia. */
export function episodesUnlockable(coins: number, cost: number = DEFAULT_UNLOCK_COST): number {
  if (cost <= 0) return Infinity;
  return Math.floor(Math.max(0, coins) / cost);
}

/** Formata contagens à portuguesa: 892 → "892", 14200 → "14,2 mil", 1300000 → "1,3 M". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1000;
    const s = k >= 100 ? String(Math.round(k)) : k.toFixed(1).replace(".", ",").replace(/,0$/, "");
    return `${s} mil`;
  }
  const m = n / 1_000_000;
  return `${m.toFixed(1).replace(".", ",").replace(/,0$/, "")} M`;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export interface StreakDay {
  index: number;
  done: boolean;
  today: boolean;
  reward: number;
}

export interface StreakView {
  /** Sequência efetiva (0 se o último check-in foi antes de ontem). */
  streak: number;
  claimedToday: boolean;
  canClaim: boolean;
  nextReward: number;
  days: StreakDay[];
}

/**
 * Calcula a vista de 7 dias da sequência. `today` e `lastCheckin` em formato YYYY-MM-DD.
 * Se o último check-in foi há mais de um dia a sequência perde-se (como no SQL).
 */
export function streakView(streak: number, lastCheckin: string | null, today: string): StreakView {
  const claimedToday = lastCheckin === today;
  const continues = claimedToday || lastCheckin === shiftDateKey(today, -1);
  const effective = continues ? Math.max(0, streak) : 0;
  const nextIndex = claimedToday ? effective : effective + 1;
  const rewardFor = (i: number) => (i % 7 === 0 ? WEEKLY_BONUS : DAILY_REWARD);

  // Janela de 7 dias alinhada ao ciclo semanal da sequência.
  const cycleStart = Math.floor((Math.max(1, nextIndex) - 1) / 7) * 7;
  const days: StreakDay[] = [];
  for (let i = 1; i <= 7; i++) {
    const idx = cycleStart + i;
    days.push({
      index: idx,
      done: idx <= effective,
      today: !claimedToday && idx === nextIndex,
      reward: rewardFor(idx),
    });
  }

  return {
    streak: effective,
    claimedToday,
    canClaim: !claimedToday,
    nextReward: rewardFor(nextIndex),
    days,
  };
}

export function adsLeftToday(adsToday: number, adsDay: string | null, today: string): number {
  if (adsDay !== today) return ADS_PER_DAY;
  return Math.max(0, ADS_PER_DAY - adsToday);
}
