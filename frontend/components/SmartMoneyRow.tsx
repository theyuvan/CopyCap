"use client";

import { motion } from "framer-motion";
import { StatusBadge } from "@/components/StatusBadge";
import { Identicon } from "@/components/Identicon";
import { CountUpValue } from "@/components/CountUpValue";
import { RelativeTime } from "@/components/RelativeTime";
import { shortAddress } from "@/lib/identity";
import { staggerItem } from "@/components/Reveal";

export function SmartMoneyRow({ opp }: { opp: any }) {
  const hasMarket = Boolean(opp.market);

  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-lg border border-border bg-panel p-5 transition-colors hover:border-border-strong"
    >
      {hasMarket && (
        <motion.div
          className="absolute inset-y-0 left-0 w-0.5 bg-success"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          style={{ transformOrigin: "top" }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Identicon address={opp.trade.traderAddress} size={40} />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted">
                {opp.trade.traderAddressLabel}
              </span>
              <span className="font-mono-nums text-xs text-muted-dim">{shortAddress(opp.trade.traderAddress)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="rounded-sm bg-danger/10 px-2 py-0.5 font-mono-nums text-xs text-danger">
                {opp.trade.tokenSoldSymbol}
              </span>
              <motion.span
                aria-hidden
                className="text-muted-dim"
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                →
              </motion.span>
              <span className="rounded-sm bg-success/10 px-2 py-0.5 font-mono-nums text-xs text-success">
                {opp.trade.tokenBoughtSymbol}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono-nums text-lg font-bold text-success">
            <CountUpValue value={opp.trade.tradeValueUsd ?? 0} prefix="$" decimals={2} />
          </div>
          <div className="font-mono-nums text-[11px] text-muted-dim">
            <RelativeTime iso={opp.trade.blockTimestamp} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {hasMarket ? (
          <>
            <div className="flex items-center gap-2">
              {opp.capacity && <StatusBadge status={opp.capacity.status} />}
              <span className="font-mono-nums text-xs text-muted-dim">{opp.market.symbol}</span>
            </div>
            {opp.capacity && <span className="text-xs text-muted">{opp.capacity.reason}</span>}
          </>
        ) : (
          <span className="text-xs text-muted-dim">No supported Kuru market for this token yet — opportunity discovery only.</span>
        )}
      </div>
    </motion.div>
  );
}
