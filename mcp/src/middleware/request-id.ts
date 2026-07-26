import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id")?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
