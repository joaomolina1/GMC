import type { Metadata, Viewport } from "next";
import { Anton, Outfit, Rubik } from "next/font/google";
import "./tvibox.css";

const ui = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-tvibox-ui",
  display: "swap",
});

const display = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-tvibox-display",
  display: "swap",
});

const logo = Rubik({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-tvibox-logo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TVI BOX",
  description: "Folhetins verticais da TVI em episódios de 90 segundos. Vê, desbloqueia, continua.",
  applicationName: "TVI BOX",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "TVI BOX" },
  icons: { icon: "/tvibox/icon.png", apple: "/tvibox/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1a1c22",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function TviBoxRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={`tvibox ${ui.variable} ${display.variable} ${logo.variable}`}>{children}</div>;
}
