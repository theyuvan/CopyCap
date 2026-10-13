import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { NavLink } from "@/components/NavLink";
import { LiveBadge } from "@/components/LiveBadge";
import { PageTransition } from "@/components/PageTransition";
import { WalletProvider } from "@/components/WalletProvider";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { Crosshair } from "lucide-react";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-accent-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CopyCap",
  description: "Capacity-aware momentum-breakout strategy copying on Monad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen bg-bg">
        <div className="site-grid" aria-hidden="true" />
        <div className="site-grain" aria-hidden="true" />
        <div className="site-frame" aria-hidden="true" />
        <span className="meta-strip meta-strip-right" aria-hidden="true">
          CopyCap · Monad Testnet
        </span>
        <span className="meta-strip meta-strip-left" aria-hidden="true">
          Live · Kuru + Nansen
        </span>
        <WalletProvider>
          <header
            className="sticky top-0 z-40 border-b border-border backdrop-blur-xl"
            style={{ background: "rgba(13, 15, 12, 0.85)" }}
          >
            <nav className="mx-auto flex h-[68px] max-w-content items-center justify-between px-6">
              <div className="flex items-center gap-10">
                <a href="/" className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent text-bg">
                    <Crosshair className="h-4 w-4" />
                  </span>
                  <span className="font-mono-nums text-sm font-bold tracking-[-.04em] text-ink">
                    COPY<span className="text-accent">CAP</span>
                  </span>
                </a>
                <div className="nav-mono hidden items-center gap-7 sm:flex">
                  <NavLink href="/strategies">Strategy Feed</NavLink>
                  <NavLink href="/smart-money">Smart Money</NavLink>
                  <NavLink href="/portfolio">My Copies</NavLink>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <LiveBadge />
                <WalletConnectButton />
              </div>
            </nav>
          </header>
          <main className="relative z-10 mx-auto max-w-content px-6 py-10">
            <PageTransition>{children}</PageTransition>
          </main>
          <footer className="relative z-10 border-t border-border bg-bg px-6 py-8">
            <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-3 text-xs text-muted-dim sm:flex-row">
              <span>
                Copy<span className="text-accent">Cap</span> — capacity checked before copy, not after.
              </span>
              <span>Kuru · Nansen · Privy · Monad testnet</span>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
