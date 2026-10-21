export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, "bad_request", msg, details);
export const unauthorized = (msg = "Authentication required") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have permission to do that", code = "forbidden") => new HttpError(403, code, msg);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (msg: string) => new HttpError(409, "conflict", msg);
export const tooMany = (msg: string) => new HttpError(429, "rate_limited", msg);
