"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WalletState } from "@lib/tvibox/types";
import { TviBoxLogo } from "./Logo";
import { useWallet, WalletProvider, type Viewer } from "./WalletProvider";

const NAV = [
  { href: "/tvibox", icon: "⚡", label: "Para Ti", feed: true },
  { href: "/tvibox/series", icon: "▦", label: "Séries" },
  { href: "/tvibox/carteira", icon: "🪙", label: "Carteira" },
  { href: "/tvibox/perfil", icon: "👤", label: "Perfil" },
];

function TopBar() {
  const { wallet, plusActive } = useWallet();
  return (
    <div className="tb-topbar">
      <Link href="/tvibox" aria-label="TVI BOX — Para Ti" style={{ textDecoration: "none" }}>
        <TviBoxLogo size={22} />
      </Link>
      <div className="spacer" />
      <Link href="/tvibox/carteira" className="tb-chip" title="Dias seguidos">
        <span className="dot">🔥</span>
        <span>{wallet.streak}</span>
      </Link>
      {plusActive ? (
        <Link href="/tvibox/carteira" className="tb-chip plus" title="TVI Box+ ativo">
          <span className="dot">✦</span>
          <span>Box+</span>
        </Link>
      ) : (
        <Link href="/tvibox/carteira" className="tb-chip coin" title="Moedas">
          <span className="dot">🪙</span>
          <span>{wallet.coins}</span>
        </Link>
      )}
    </div>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const onFeed = pathname === "/tvibox";
  return (
    <nav className={`tb-nav ${onFeed ? "" : "solid"}`} aria-label="Navegação TVI BOX">
      {NAV.map((n) => {
        const active = n.feed ? onFeed : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={`${active ? "active" : ""} ${n.feed ? "feedbtn" : ""}`}>
            <span className="ne">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function StudioPanel() {
  return (
    <aside className="tb-studio">
      <TviBoxLogo size={44} layout="stack" />
      <p>
        Um <strong>fork do TVI Player</strong> reconstruído sobre o modelo DramaBox: ficção e telenovela
        recortadas em <strong>verticais de ~75 segundos</strong>, num feed <em>swipe</em> com desbloqueio à moeda.
      </p>
      <p>
        O motor não é o catálogo — é o <strong>cliffhanger</strong>. Primeiro episódio grátis, suspense no fim e
        uma decisão de pagamento a cada poucos minutos.
      </p>
      <div className="pills">
        <span className="pill red">Vertical 9:16</span>
        <span className="pill">Coin unlock</span>
        <span className="pill">Streak diário</span>
        <span className="pill">Freemium + ads</span>
        <span className="pill blue">TVI Box+</span>
      </div>
      <p className="note">
        Protótipo interativo sobre a base de utilizadores GMC. Títulos, posters e atores são fictícios e gerados por
        IA. Encolhe a janela ou abre no telemóvel para a experiência nativa.
      </p>
      <Link href="/" className="back">
        ← Voltar à plataforma GMC
      </Link>
    </aside>
  );
}

export function Shell({
  viewer,
  wallet,
  children,
}: {
  viewer: Viewer;
  wallet: WalletState;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // No player (/tvibox/ver/…) o vídeo ocupa o ecrã todo: sem barra de moedas nem navegação.
  const immersive = pathname.startsWith("/tvibox/ver/");
  return (
    <div className="tb-stage">
      <StudioPanel />
      <div className="tb-phone">
        <div className="tb-screen">
          <WalletProvider viewer={viewer} initialWallet={wallet}>
            <div className="tb-notch" />
            {!immersive && <TopBar />}
            {children}
            {!immersive && <BottomNav />}
          </WalletProvider>
        </div>
      </div>
    </div>
  );
}
