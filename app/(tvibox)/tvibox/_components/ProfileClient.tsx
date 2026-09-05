"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@lib/supabase/client";
import { useSubtitles } from "./useSubtitles";
import { useWallet } from "./WalletProvider";

export function ProfileClient({ stats }: { stats: { seen: number; following: number; unlocked: number } }) {
  const { viewer, wallet, setWallet, api, toast, plusActive } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useSubtitles();

  const since = new Date(viewer.memberSince).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

  async function toggleSetting(key: "parental") {
    if (busy) return;
    const next = !wallet.settings[key];
    setBusy(key);
    setWallet({ settings: { ...wallet.settings, [key]: next } });
    try {
      await api("/api/tvibox/settings", { [key]: next }, "PATCH");
      toast(next ? "Controlo parental ativo — só conteúdos para todas as idades" : "Controlo parental desativado");
    } catch {
      setWallet({ settings: { ...wallet.settings, [key]: !next } });
      toast("Não foi possível guardar a definição");
    } finally {
      setBusy(null);
    }
  }

  function toggleSubtitles() {
    const next = !subtitles;
    setSubtitles(next);
    toast(next ? "Legendas ligadas nesta sessão" : "Legendas desligadas");
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
          <button type="button" className="tb-pli" onClick={toggleSubtitles} aria-pressed={subtitles}>
            <span className="e">💬</span> Legendas (só nesta sessão)
            <span className={`tb-switch ${subtitles ? "on" : ""}`} aria-hidden />
          </button>
          <Link href="/tvibox/carteira" className="tb-pli">
            <span className="e">🪙</span> Carteira e subscrição
            <span className="ar">
              {plusActive ? "Box+ ativo" : `${wallet.coins} 🪙`} ›
            </span>
          </Link>
          {viewer.isAdmin && (
            <Link href="/admin/tvibox" className="tb-pli">
              <span className="e">🎬</span> Estúdio TVI Box — gerir séries e episódios <span className="ar">›</span>
            </Link>
          )}
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
