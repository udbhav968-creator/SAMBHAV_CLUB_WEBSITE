import type { Request, Response, NextFunction, RequestHandler } from "express";
/** Wrap async handlers so rejections reach the error middleware. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

/** Retries a SERIALIZABLE transaction on serialization failure (SQLSTATE 40001) with jittered backoff. */
export async function withSerializableRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "40001" || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 10 * 2 ** i + Math.random() * 20));
    }
  }
}
