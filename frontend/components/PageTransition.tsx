"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Enter-only page fade. Deliberately no AnimatePresence/exit animation: in the
 * Next.js App Router the new route's children are swapped in before an exit
 * animation finishes, and `mode="wait"` can leave the incoming page stuck at
 * its initial opacity 0 — a blank page after navigation.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
