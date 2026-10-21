import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny, z } from "zod";

/** Validates and replaces req.body / req.query / req.params with parsed values. */
export const validate = (s: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (s.body) req.body = s.body.parse(req.body);
    if (s.query) Object.defineProperty(req, "query", { value: s.query.parse(req.query), writable: true });
    if (s.params) req.params = s.params.parse(req.params);
    next();
  } catch (e) { next(e); }
};
export type Body<T extends ZodTypeAny> = z.infer<T>;
