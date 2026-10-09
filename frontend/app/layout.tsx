import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MirrorCap",
  description: "Capacity-aware momentum-breakout strategy copying on Monad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] px-6 py-4">
          <nav className="mx-auto flex max-w-5xl items-center gap-6">
            <Link href="/" className="text-lg font-semibold">
              MirrorCap
            </Link>
            <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
              Strategy Feed
            </Link>
            <Link href="/smart-money" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
              Smart Money Feed
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
