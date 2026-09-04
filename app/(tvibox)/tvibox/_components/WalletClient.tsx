"use client";

import { useMemo, useState } from "react";
import {
  AD_REWARD,
  DEFAULT_UNLOCK_COST,
  PACKS,
  PLUS_PRICE,
  PLUS_TRIAL_DAYS,
  episodesUnlockable,
  streakView,
  toDateKey,
} from "@lib/tvibox/economy";
import { useWallet } from "./WalletProvider";

interface Tx {
  id: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  welcome: "Bónus de boas-vindas",
  daily_checkin: "Check-in diário",
  ad_reward: "Anúncio visto",
  purchase: "Compra de moedas",
  unlock: "Desbloqueio de episódio",
  plus: "TVI Box+",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function WalletClient({ initialTransactions }: { initialTransactions: Tx[] }) {
  const { wallet, setWallet, api, toast, watchAd, plusActive } = useWallet();
  const [tx, setTx] = useState<Tx[]>(initialTransactions);
  const [busy, setBusy] = useState<string | null>(null);

  const today = toDateKey(new Date());
  const streak = useMemo(() => streakView(wallet.streak, wallet.lastCheckin, today), [wallet.streak, wallet.lastCheckin, today]);

  function pushTx(delta: number, reason: string, label: string) {
    setTx((prev) => [
      { id: `local-${Date.now()}`, delta, reason, metadata: { label }, created_at: new Date().toISOString() },
      ...prev,
    ]);
  }

  async function claimDaily() {
    if (busy) return;
    setBusy("checkin");
    try {
      const r = await api<{ ok: boolean; error?: string; coins?: number; streak?: number; reward?: number }>(
        "/api/tvibox/checkin"
      );
      if (r.ok) {
        setWallet({ coins: r.coins ?? wallet.coins, streak: r.streak ?? wallet.streak, lastCheckin: today });
        pushTx(r.reward ?? 0, "daily_checkin", "Check-in diário");
        toast(`+${r.reward} 🪙 · sequência de ${r.streak} dias`);
      } else if (r.error === "already") {
        setWallet({ lastCheckin: today });
        toast("Já resgataste hoje ✓");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function onAd() {
    const ok = await watchAd();
    if (ok) pushTx(AD_REWARD, "ad_reward", "Anúncio visto");
  }

  async function buy(pack: (typeof PACKS)[number]) {
    if (busy) return;
    setBusy(pack.id);
    try {
      const r = await api<{ ok: boolean; coins?: number; added?: number; price?: string }>("/api/tvibox/buy", { pack: pack.id });
      if (r.ok) {
        setWallet({ coins: r.coins ?? wallet.coins });
        pushTx(r.added ?? pack.coins, "purchase", `Pacote ${r.added} moedas`);
        toast(`+${r.added} 🪙 (${r.price} · compra simulada)`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function startPlus() {
    if (busy) return;
    setBusy("plus");
    try {
      const r = await api<{ ok: boolean; plus_until?: string; trial?: boolean }>("/api/tvibox/plus");
      if (r.ok && r.plus_until) {
        setWallet({ plusUntil: r.plus_until });
        pushTx(0, "plus", r.trial ? "TVI Box+ · teste 7 dias" : "TVI Box+ · renovação");
        toast(r.trial ? `TVI Box+ ativo · ${PLUS_TRIAL_DAYS} dias grátis` : "TVI Box+ renovado (+30 dias)");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  const plusUntilLabel = wallet.plusUntil
    ? new Date(wallet.plusUntil).toLocaleDateString("pt-PT", { day: "2-digit", month: "long" })
    : null;

  return (
    <section className="tb-view" aria-label="Carteira">
      <div className="tb-vhead">
        <h1>Carteira</h1>
        <p>As tuas moedas e como ganhar mais</p>
      </div>
      <div className="tb-body">
        <div className="tb-balcard">
          <div className="glow" />
          <div className="lab">Saldo de moedas</div>
          <div className="big">
            <span className="dot">🪙</span>
            <span>{wallet.coins}</span>
          </div>
          <div className="hint">
            Desbloqueia ~{episodesUnlockable(wallet.coins, DEFAULT_UNLOCK_COST)} episódios · {DEFAULT_UNLOCK_COST} moedas
            cada
          </div>
          {plusActive && <div className="plusline">✦ TVI Box+ ativo até {plusUntilLabel} — episódios sem custo</div>}
        </div>

        <div className="tb-panel">
          <div className="row">
            <b>Sequência diária</b>
            <span>🔥 {streak.streak} dias seguidos</span>
          </div>
          <div className="tb-days">
            {streak.days.map((d) => (
              <div key={d.index} className={`tb-day ${d.done ? "done" : ""} ${d.today ? "today" : ""}`}>
                <b>{d.done ? "✓" : `+${d.reward}`}</b>D{d.index}
              </div>
            ))}
          </div>
          <button type="button" className="tb-btn-gold" onClick={claimDaily} disabled={!streak.canClaim || busy === "checkin"}>
            {streak.canClaim ? `Resgatar +${streak.nextReward} 🪙 de hoje` : "Já resgataste hoje ✓"}
          </button>
        </div>

        <div className="tb-packs">
          <button type="button" className="tb-pack" onClick={onAd} disabled={wallet.adsLeft <= 0}>
            <div className="px">▶️</div>
            <div className="pmid">
              <b>Ver anúncio</b>
              <span>
                +{AD_REWARD} moedas · {wallet.adsLeft > 0 ? `${wallet.adsLeft} disponíveis hoje` : "limite diário atingido"}
              </span>
            </div>
            <div className="ppr">Grátis</div>
          </button>
          {PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tb-pack ${p.best ? "best" : ""}`}
              onClick={() => buy(p)}
              disabled={busy === p.id}
            >
              <div className="px">{p.icon}</div>
              <div className="pmid">
                <b>
                  {p.coins} moedas {p.bonus > 0 && <span className="tb-bestlab">+{p.bonus} bónus</span>}
                </b>
                <span>desbloqueia ~{episodesUnlockable(p.coins + p.bonus)} episódios</span>
              </div>
              <div className="ppr">{p.price}</div>
            </button>
          ))}
        </div>

        <button type="button" className="tb-sub" onClick={startPlus} disabled={busy === "plus"}>
          <b>TVI Box+</b>
          <p>Tudo desbloqueado, sem anúncios e episódios em antestreia. {PLUS_PRICE}.</p>
          <span className="cta">{plusActive ? `Ativo até ${plusUntilLabel} · renovar` : `Experimentar ${PLUS_TRIAL_DAYS} dias grátis`}</span>
        </button>

        <div>
          <p className="tb-section-title">Movimentos</p>
          <div className="tb-tx">
            {tx.length === 0 && <div className="tb-empty">Ainda não há movimentos.</div>}
            {tx.map((t) => (
              <div className="t" key={t.id}>
                <div>
                  {String(t.metadata?.label ?? REASON_LABEL[t.reason] ?? t.reason)}
                  <span>{fmtDate(t.created_at)}</span>
                </div>
                <b className={t.delta > 0 ? "pos" : t.delta < 0 ? "neg" : ""}>
                  {t.delta > 0 ? `+${t.delta}` : t.delta < 0 ? t.delta : "✦"}
                </b>
              </div>
            ))}
          </div>
        </div>
        <p className="tb-empty" style={{ padding: "6px 0 0", fontSize: 11 }}>
          Compras e subscrição são simuladas neste protótipo — não há pagamentos reais.
        </p>
      </div>
    </section>
  );
}
