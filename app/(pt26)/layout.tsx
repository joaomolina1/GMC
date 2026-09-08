import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./pt26.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "800"],
  variable: "--font-pt26",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PT26 · Tracking poll",
  description: "Ecrã do pivot — sondagem semanal PORTUGAL26",
  robots: { index: false, follow: false },
};

// Ecrã tátil em estúdio: sem zoom por pinch, área segura completa.
export const viewport: Viewport = {
  themeColor: "#040b22",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function Pt26Layout({ children }: { children: React.ReactNode }) {
  return <div className={`pt26 ${sora.variable}`}>{children}</div>;
}
