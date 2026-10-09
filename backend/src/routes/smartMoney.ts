import { Router } from "express";
import { getSmartMoneyOpportunities } from "../lib/nansen.js";

export const smartMoneyRouter = Router();

smartMoneyRouter.get("/opportunities", async (_req, res) => {
  const { opportunities, source } = await getSmartMoneyOpportunities();
  res.json({
    source,
    note: "Nansen Smart Money DEX Trades only indexes the trailing 24 hours; there is no historical date-range query.",
    opportunities,
  });
});
