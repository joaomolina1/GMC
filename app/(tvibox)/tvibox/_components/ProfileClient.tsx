"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@lib/supabase/client";
import { useWallet } from "./WalletProvider";

export function ProfileClient({ stats }: { stats: { seen: number; following: number; unlocked: number } }) {
  const { viewer, wallet, setWallet, api, toast, plusActive } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const since = new Date(viewer.memberSince).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  async function toggleSetting(key: "subtitles" | "parental") {
    if (busy) return;
    const next = !wallet.settings[key];
    setBusy(key);
    setWallet({ settings: { ...wallet.settings, [key]: next } });
    try {
      await api("/api/tvibox/settings", { [key]: next }, "PATCH");
      toast(
        key === "subtitles"
          ? next
            ? "Legendas automáticas ativadas"
            : "Legendas desativadas"
          : next
            ? "Controlo parental ativo — só conteúdos para todas as idades"
            : "Controlo parental desativado"
      );
    } catch {
      setWallet({ settings: { ...wallet.settings, [key]: !next } });
      toast("Não foi possível guardar a definição");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/tvibox/entrar");
    router.refresh();
  }

  return (
    <section className="tb-view" aria-label="Perfil">
      <div className="tb-vhead">
        <h1>Perfil</h1>
        <p>Conta GMC · sessão iniciada</p>
      </div>
      <div className="tb-body">
        <div className="tb-pf-top">
          <div className="tb-pf-av">{viewer.initials}</div>
          <div>
            <b>{viewer.fullName || viewer.email.split("@")[0]}</b>
            <span>{viewer.email}</span>
            <span>Membro TVI Box desde {since}</span>
          </div>
        </div>

        <div className="tb-stats">
          <div className="tb-stat">
            <b>{stats.seen}</b>
            <span>EPISÓDIOS VISTOS</span>
          </div>
          <div className="tb-stat">
            <b>{stats.following}</b>
            <span>SÉRIES A SEGUIR</span>
          </div>
          <div className="tb-stat">
            <b>🔥{wallet.streak}</b>
            <span>SEQUÊNCIA</span>
          </div>
        </div>

        <div className="tb-plist">
          <Link href="/tvibox/series" className="tb-pli">
            <span className="e">📺</span> A continuar a ver <span className="ar">›</span>
          </Link>
          <Link href="/tvibox/lista" className="tb-pli">
            <span className="e">🔖</span> A Minha Lista <span className="ar">{stats.following} ›</span>
          </Link>
          <button type="button" className="tb-pli" onClick={() => toggleSetting("parental")} aria-pressed={wallet.settings.parental}>
            <span className="e">🛡️</span> Controlo parental
            <span className={`tb-switch ${wallet.settings.parental ? "on" : ""}`} aria-hidden />
          </button>
          <button type="button" className="tb-pli" onClick={() => toggleSetting("subtitles")} aria-pressed={wallet.settings.subtitles}>
            <span className="e">💬</span> Legendas automáticas (IA)
            <span className={`tb-switch ${wallet.settings.subtitles ? "on" : ""}`} aria-hidden />
          </button>
          <Link href="/tvibox/carteira" className="tb-pli">
            <span className="e">🪙</span> Carteira e subscrição
            <span className="ar">
              {plusActive ? "Box+ ativo" : `${wallet.coins} 🪙`} ›
            </span>
          </Link>
          {viewer.isAdmin && (
            <Link href="/admin" className="tb-pli">
              <span className="e">🛠️</span> Backoffice GMC <span className="ar">›</span>
            </Link>
          )}
          <Link href="/" className="tb-pli">
            <span className="e">🏠</span> Plataforma de agentes GMC <span className="ar">›</span>
          </Link>
          <button type="button" className="tb-pli" onClick={signOut}>
            <span className="e">🚪</span> Terminar sessão
          </button>
        </div>
        <p className="tb-empty" style={{ padding: "4px 0 0", fontSize: 11 }}>
          {stats.unlocked} episódios desbloqueados · TVI BOX é um protótipo interno do Grupo Media Capital.
        </p>
      </div>
    </section>
  );
}
