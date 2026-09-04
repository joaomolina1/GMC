"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AD_REWARD, isPlusActive } from "@lib/tvibox/economy";
import type { WalletState } from "@lib/tvibox/types";
import type { TviboxViewer } from "@lib/tvibox/server";

export type Viewer = Pick<TviboxViewer, "id" | "email" | "fullName" | "initials" | "memberSince" | "isAdmin">;

interface UnlockResult {
  ok: boolean;
  error?: string;
  coins?: number;
  cost?: number;
  already?: boolean;
}

interface Ctx {
  viewer: Viewer;
  wallet: WalletState;
  plusActive: boolean;
  setWallet: (w: Partial<WalletState>) => void;
  toast: (message: string) => void;
  api: <T = Record<string, unknown>>(path: string, body?: unknown, method?: string) => Promise<T>;
  unlock: (episodeId: string) => Promise<UnlockResult>;
  watchAd: () => Promise<boolean>;
  adPlaying: boolean;
}

const WalletContext = createContext<Ctx | null>(null);

export const AD_SECONDS = 4;

export function WalletProvider({
  viewer,
  initialWallet,
  children,
}: {
  viewer: Viewer;
  initialWallet: WalletState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [wallet, setWalletState] = useState<WalletState>(initialWallet);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
  }, []);

  const setWallet = useCallback((w: Partial<WalletState>) => {
    setWalletState((prev) => ({ ...prev, ...w }));
  }, []);

  const api = useCallback(async <T,>(path: string, body?: unknown, method = "POST"): Promise<T> => {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
    return json;
  }, []);

  const unlock = useCallback(
    async (episodeId: string): Promise<UnlockResult> => {
      try {
        const r = await api<UnlockResult>("/api/tvibox/unlock", { episodeId });
        if (r.ok) {
          if (typeof r.coins === "number") setWallet({ coins: r.coins });
          if (r.already) toast("Já tinhas desbloqueado este episódio");
          else if (r.cost) toast(`Desbloqueado · −${r.cost} 🪙`);
          else toast("Desbloqueado · incluído no TVI Box+");
        } else if (r.error === "insufficient") {
          toast("Moedas insuficientes — ganha mais 🪙");
          router.push("/tvibox/carteira");
        } else {
          toast("Não foi possível desbloquear");
        }
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Erro de rede");
        return { ok: false, error: "network" };
      }
    },
    [api, router, setWallet, toast]
  );

  const watchAd = useCallback(async () => {
    if (adPlaying) return false;
    if (wallet.adsLeft <= 0) {
      toast("Limite diário de anúncios atingido");
      return false;
    }
    setAdPlaying(true);
    await new Promise((r) => setTimeout(r, AD_SECONDS * 1000));
    try {
      const r = await api<{ ok: boolean; coins?: number; ads_left?: number; error?: string }>("/api/tvibox/ad");
      if (r.ok) {
        setWallet({ coins: r.coins ?? wallet.coins, adsLeft: r.ads_left ?? wallet.adsLeft - 1 });
        toast(`+${AD_REWARD} 🪙 ganhas`);
        return true;
      }
      toast(r.error === "limit" ? "Limite diário de anúncios atingido" : "Anúncio não creditado");
      return false;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro de rede");
      return false;
    } finally {
      setAdPlaying(false);
    }
  }, [adPlaying, api, setWallet, toast, wallet.adsLeft, wallet.coins]);

  const value = useMemo<Ctx>(
    () => ({
      viewer,
      wallet,
      plusActive: isPlusActive(wallet.plusUntil),
      setWallet,
      toast,
      api,
      unlock,
      watchAd,
      adPlaying,
    }),
    [viewer, wallet, setWallet, toast, api, unlock, watchAd, adPlaying]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <div className={`tb-toast ${toastMsg ? "show" : ""}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
      {adPlaying && (
        <div className="tb-ad" style={{ ["--ad-dur" as string]: `${AD_SECONDS}s` }} aria-live="polite">
          <div className="logo-wrap">📺</div>
          <div className="cnt">
            <AdCountdown seconds={AD_SECONDS} />
          </div>
          <p>Anúncio simulado · recebes +{AD_REWARD} moedas no fim</p>
          <div className="ring">
            <i />
          </div>
        </div>
      )}
    </WalletContext.Provider>
  );
}

function AdCountdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => (l > 1 ? l - 1 : 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{left}</>;
}

export function useWallet(): Ctx {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet fora de WalletProvider");
  return ctx;
}
