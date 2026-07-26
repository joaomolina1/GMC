import type { RequestHandler } from "express";
import { AppError } from "../errors.js";
import { assertMcpAuth } from "./authentication.js";

/** Express-only bearer middleware (local HTTP server). Not used on Vercel. */
export function createBearerAuthMiddleware(expectedToken: string | null): RequestHandler {
  return (req, res, next) => {
    try {
      assertMcpAuth(req.header("authorization") ?? undefined, expectedToken);
      next();
    } catch (err) {
      if (err instanceof AppError && err.code === "AUTH_FAILED") {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
          id: null,
        });
        return;
      }
      next(err);
    }
  };
}
