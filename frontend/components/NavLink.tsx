"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link href={href} className="relative px-1 py-1">
      <span className={active ? "text-ink" : "text-muted transition-colors hover:text-accent"}>{children}</span>
      {active && (
        <motion.div
          layoutId="nav-underline"
          className="absolute -bottom-[24px] left-0 right-0 h-[2px] bg-accent shadow-glow"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
    </Link>
  );
}
