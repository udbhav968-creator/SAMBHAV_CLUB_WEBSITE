import type { Config } from "../config.js";

/** Weak-password gate for privileged accounts: on in production unless explicitly disabled. */
export const enforcePasswordChange = (c: Pick<Config, "ENFORCE_PASSWORD_CHANGE" | "NODE_ENV">) =>
  c.ENFORCE_PASSWORD_CHANGE === "true" || (c.ENFORCE_PASSWORD_CHANGE === "auto" && c.NODE_ENV === "production");
