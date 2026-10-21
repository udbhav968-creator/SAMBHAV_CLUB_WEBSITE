/**
 * Sambhav relational model (PostgreSQL, Drizzle ORM).
 * Conventions: uuid primary keys, timestamptz everywhere, explicit unique constraints for idempotency
 * (one registration / one attendance mark per member per entity), soft-delete for users.
 */
import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, uniqueIndex, index, primaryKey, smallint, doublePrecision } from "drizzle-orm/pg-core";

export const role = pgEnum("role", ["ADMIN", "COORDINATOR", "MEMBER"]);
export const sessionStatus = pgEnum("session_status", ["SCHEDULED", "OPEN", "CLOSED"]);
export const markMethod = pgEnum("mark_method", ["CODE", "QR", "MANUAL"]);
export const bloomLevel = pgEnum("bloom_level", ["L1", "L2", "L3", "L4", "L5", "L6"]);
export const game = pgEnum("game", ["ROULETTE", "PD", "GUESS", "RPS", "AUCTION", "ULTIMATUM", "LIVE_GUESS"]);
export type Role = (typeof role.enumValues)[number];
export type GameKind = (typeof game.enumValues)[number];

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /** Optional short login handle (e.g. the attendance admin "udbhav"). */
  username: text("username").unique(),
  /** E.164 mobile number used for OTP (never returned in full by the API). */
  phone: text("phone"),
  passwordChangedAt: ts("password_changed_at"),
  /** Set when the account signs in with a password weaker than the policy (e.g. the seeded admin PIN). */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  rollNo: text("roll_no").unique(),
  programme: text("programme"),
  year: integer("year"),
  title: text("title"),
  interests: text("interests"),
  role: role("role").notNull().default("MEMBER"),
  credits: integer("credits").notNull().default(1000),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("users_role_idx").on(t.role)]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  family: text("family").notNull(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  userAgent: text("user_agent"),
  createdAt: created(),
}, (t) => [index("rt_user_idx").on(t.userId), index("rt_family_idx").on(t.family)]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: text("type").notNull().default("Workshop"),
  startsAt: ts("starts_at").notNull(),
  venue: text("venue"),
  capacity: integer("capacity"),
  description: text("description"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("events_starts_idx").on(t.startsAt)]);

export const registrations = pgTable("registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: created(),
}, (t) => [uniqueIndex("registrations_event_user_uq").on(t.eventId, t.userId)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  date: ts("date").notNull(),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  status: sessionStatus("status").notNull().default("SCHEDULED"),
  /** AES-256-GCM encrypted TOTP secret (iv:tag:ciphertext). Never leaves the server. */
  secretEnc: text("secret_enc").notNull(),
  openedAt: ts("opened_at"),
  closedAt: ts("closed_at"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: created(),
}, (t) => [index("sessions_date_idx").on(t.date), index("sessions_status_idx").on(t.status)]);

export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  method: markMethod("method").notNull(),
  markedAt: ts("marked_at").notNull().defaultNow(),
  markedById: uuid("marked_by_id").references(() => users.id),
}, (t) => [uniqueIndex("attendance_session_user_uq").on(t.sessionId, t.userId), index("attendance_user_idx").on(t.userId)]);

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tag: text("tag").notNull().default("General"),
  pinned: boolean("pinned").notNull().default(false),
  authorId: uuid("author_id").notNull().references(() => users.id),
  createdAt: created(),
}, (t) => [index("notices_pinned_created_idx").on(t.pinned, t.createdAt)]);

export interface Outcome { id: string; text: string }
export interface Lesson { title: string; html: string }
export const modules = pgTable("modules", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  short: text("short").notNull(),
  hours: integer("hours").notNull(),
  order: integer("order").notNull(),
  game: text("game").notNull(),
  outcomes: jsonb("outcomes").$type<Outcome[]>().notNull(),
  lessons: jsonb("lessons").$type<Lesson[]>().notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  level: bloomLevel("level").notNull(),
  lo: text("lo").notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[] | null>(),
  answerIndex: integer("answer_index"),
  explanation: text("explanation"),
  open: boolean("open").notNull().default(false),
  rubric: jsonb("rubric").$type<string[] | null>(),
  model: text("model"),
}, (t) => [uniqueIndex("questions_module_order_uq").on(t.moduleId, t.order)]);

export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  answers: jsonb("answers").notNull(),
  createdAt: created(),
}, (t) => [index("quiz_user_module_idx").on(t.userId, t.moduleId)]);

export const lessonProgress = pgTable("lesson_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: text("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  lessonIndex: integer("lesson_index").notNull(),
  completedAt: ts("completed_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.moduleId, t.lessonIndex] })]);

/** Append-only ledger of game outcomes and points — the source of truth for the leaderboard. */
export const gameRecords = pgTable("game_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  game: game("game").notNull(),
  points: integer("points").notNull().default(0),
  payload: jsonb("payload").notNull(),
  createdAt: created(),
}, (t) => [index("game_user_idx").on(t.userId, t.game), index("game_created_idx").on(t.createdAt)]);

export const fairSeeds = pgTable("fair_seeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serverSeed: text("server_seed").notNull(),
  serverSeedHash: text("server_seed_hash").notNull(),
  clientSeed: text("client_seed").notNull(),
  nonce: integer("nonce").notNull().default(0),
  active: boolean("active").notNull().default(true),
  revealedAt: ts("revealed_at"),
  createdAt: created(),
}, (t) => [index("fair_user_active_idx").on(t.userId, t.active)]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: jsonb("meta"),
  createdAt: created(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)]);

/**
 * LLMOps telemetry: one row per Vihaan answer. Question/answer text is truncated and purged after
 * AI_LOG_RETENTION_DAYS; it feeds the admin dashboard, feedback triage and the eval golden set.
 */
export const aiInteractions = pgTable("ai_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  mode: text("mode").notNull(),                 // ai | instant | offline | error
  model: text("model"),
  promptVersion: text("prompt_version"),
  promptHash: text("prompt_hash"),
  page: text("page"),
  question: text("question"),
  answer: text("answer"),
  toolCalls: jsonb("tool_calls").$type<string[]>().notNull().default([]),
  navigatedTo: text("navigated_to"),
  rounds: smallint("rounds").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  latencyMs: integer("latency_ms").notNull(),
  firstTokenMs: integer("first_token_ms"),
  stopReason: text("stop_reason"),
  error: text("error"),
  rating: smallint("rating"),                   // +1 helpful, -1 not helpful
  feedbackNote: text("feedback_note"),
  createdAt: created(),
}, (t) => [index("ai_created_idx").on(t.createdAt), index("ai_rating_idx").on(t.rating)]);

export type User = typeof users.$inferSelect;
