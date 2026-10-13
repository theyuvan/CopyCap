import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { PrivyApiError } from "@mirrorcap/privy-client";
import { ExecutionError } from "./execution.js";
import { PrivyNotConfiguredError } from "./privy.js";

/** Express 4 doesn't forward rejected promises to error middleware on its own. */
export function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ExecutionError) {
    return res.status(err.httpStatus).json({ error: err.message, code: err.code });
  }
  if (err instanceof PrivyNotConfiguredError) {
    return res.status(503).json({ error: err.message, code: "PRIVY_NOT_CONFIGURED" });
  }
  if (err instanceof PrivyApiError) {
    // eslint-disable-next-line no-console
    console.error("[privy]", err.message, err.body);
    return res.status(502).json({ error: err.message, code: "PRIVY_ERROR" });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Internal error", code: "INTERNAL" });
};
