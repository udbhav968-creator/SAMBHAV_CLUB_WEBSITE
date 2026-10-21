import { createHash } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  /** 64 hex chars (32 bytes) are used as-is; any other secret of ≥32 chars is hashed to 32 bytes (lets PaaS blueprints auto-generate it). */
  ATTENDANCE_KEY: z.string().min(32, "ATTENDANCE_KEY must be at least 32 characters (openssl rand -hex 32)")
    .transform((k) => (/^[0-9a-f]{64}$/i.test(k) ? k : createHash("sha256").update(k).digest("hex"))),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  TOTP_STEP_SECONDS: z.coerce.number().default(30),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().regex(/^[a-z0-9._-]{3,32}$/).optional(),
  /** Seed-only initial password; the admin should rotate it through the OTP flow. */
  ADMIN_PASSWORD: z.string().min(4).optional(),
  ADMIN_PHONE: z.string().regex(/^\+\d{8,15}$/, "ADMIN_PHONE must be E.164, e.g. +91XXXXXXXXXX").optional(),
  /** SMS gateway for OTPs: console (dev — logs the code), msg91, twilio or fast2sms. */
  SMS_PROVIDER: z.enum(["console", "msg91", "twilio", "fast2sms"]).default("console"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().optional(),
  SMS_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  /** Dev/test only: the console SMS provider also appends codes here (ignored in production). */
  SMS_OUTBOX_FILE: z.string().optional(),
  /** Block admin tools until a weak password (e.g. the seeded PIN) is rotated. "auto" = on in production. */
  ENFORCE_PASSWORD_CHANGE: z.enum(["auto", "true", "false"]).default("auto"),
  /** Optional anti-proxy attendance: comma-separated CIDRs (campus Wi-Fi egress ranges) allowed to check in. Empty = anywhere. */
  CHECKIN_ALLOWED_CIDRS: z.string().default(""),
  /** Vihaan, the AI guide. Without a key Vihaan runs in offline mode (navigation + FAQ). */
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-haiku-5-5"),
  /** Thinking counts toward max_tokens on newer models — keep headroom above the ~110-word answers. */
  AI_MAX_TOKENS: z.coerce.number().default(1500),
  /** output_config.effort, sent only to models that support it. "low" keeps a navigation guide fast and cheap. */
  AI_EFFORT: z.enum(["low", "medium", "high"]).optional().default("low"),
  /** Pin a prompt version from the registry (lib/vihaan.ts); unset = latest. */
  AI_PROMPT_VERSION: z.string().optional(),
  /** Days to keep Vihaan question/answer text for quality review. */
  AI_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Bearer token for GET /metrics (Prometheus). Unset = /metrics disabled. */
  METRICS_TOKEN: z.string().min(16).optional(),
  /** Model calls per 10 minutes: per signed-in user, and per IP for visitors (high because a campus shares one NAT IP). */
  AI_USER_QUOTA: z.coerce.number().default(30),
  AI_VISITOR_QUOTA: z.coerce.number().default(200),
  /** Hard ceiling on model calls per UTC day across the whole site — bounds the monthly bill. */
  AI_DAILY_CAP: z.coerce.number().default(3000),
});

export type Config = z.infer<typeof schema>;
/** `KEY=` lines in .env files arrive as "" — treat them as unset so optional settings fall back to defaults. */
export const parseConfig = (env: NodeJS.ProcessEnv): Config => schema.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")));
export const config: Config = parseConfig(process.env);
export const isProd = config.NODE_ENV === "production";
