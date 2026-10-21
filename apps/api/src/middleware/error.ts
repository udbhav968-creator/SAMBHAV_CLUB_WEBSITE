import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/** Postgres SQLSTATE, whether the driver error is raw or wrapped by the ORM. */
const pgCode = (e: unknown): string | undefined => { const x = e as { code?: string; cause?: { code?: string } }; return x?.code ?? x?.cause?.code; };

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: { code: "validation_failed", message: "Some fields are invalid", details: err.flatten() } });
  if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof RangeError) return res.status(400).json({ error: { code: "bad_request", message: err.message } });
  const code = pgCode(err);
  if (code === "23505") return res.status(409).json({ error: { code: "conflict", message: "That record already exists" } });
  if (code === "23503") return res.status(409).json({ error: { code: "conflict", message: "A related record does not exist" } });
  if (code === "22P02") return res.status(400).json({ error: { code: "bad_request", message: "Malformed identifier" } });
  if (code === "40001") return res.status(409).json({ error: { code: "conflict", message: "Busy — please retry" } });
  logger.error({ err, path: req.path }, "unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong on our side" } });
}
export const notFoundHandler = (_req: Request, res: Response) => res.status(404).json({ error: { code: "not_found", message: "No such endpoint" } });
