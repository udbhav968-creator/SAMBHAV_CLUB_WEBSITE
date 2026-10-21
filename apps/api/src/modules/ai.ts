import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, isNull, lt, or } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { limiter } from "../middleware/rateLimit.js";
import { logger } from "../lib/logger.js";
import { intentOf, PAGES, promptFor } from "../lib/vihaan.js";
import type { LlmBlock, LlmMessage, LlmTool } from "../lib/llm.js";
import { costUsd } from "../lib/aiPricing.js";
import { aiCost, aiErrors, aiFeedback, aiFirstToken, aiLatency, aiRequests, aiTokens, aiTools } from "../lib/metrics.js";
import { notFound } from "../lib/errors.js";
import { aiInteractions, events, modules, notices, sessions, users } from "../db/schema.js";
import { leaderboard } from "./points.js";
import { attendanceSummary } from "./users.js";

const MAX_ROUNDS = 5;
const GAMES: [string, string, string][] = [
  ["/arena/roulette", "Roulette Lab", "provably fair roulette, expected value, house edge, martingale"],
  ["/arena/pd", "Prisoner's Dilemma", "repeated games, tit-for-tat, Axelrod tournament, cooperation"],
  ["/arena/guess", "Guess 2/3 of the average", "level-k thinking, Keynesian beauty contest"],
  ["/arena/live", "Live Arena", "multiplayer 2/3 round, club night"],
  ["/arena/rps", "Rock-Paper-Scissors", "mixed strategy, pattern exploitation"],
  ["/arena/nash", "Nash Solver", "best response, pure and mixed Nash equilibrium, bimatrix"],
  ["/arena/auction", "Sealed-bid auction", "first-price, Vickrey, bid shading, winner's curse"],
  ["/arena/ultimatum", "Ultimatum game", "bargaining, fairness, subgame perfect"],
];

export const TOOLS: LlmTool[] = [
  { name: "navigate", description: "Open a page of the Sambhav website for the user. Use whenever the user wants to go somewhere or would benefit from seeing a page.", input_schema: { type: "object", properties: { page: { type: "string", enum: Object.keys(PAGES) } }, required: ["page"] } },
  { name: "get_club_snapshot", description: "Live club data: upcoming events, latest notices, top 3 of the leaderboard, open attendance sessions. Use for any question about the club's current state.", input_schema: { type: "object", properties: {} } },
  { name: "search_site", description: "Search modules, games and events for a topic. Returns up to 6 matches with the page path to open.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_my_progress", description: "The signed-in user's own points, rank and attendance. Returns signedIn:false for visitors.", input_schema: { type: "object", properties: {} } },
];
const chatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(16)
    .refine((m) => m.at(-1)?.role === "user","The last message must be from the user"),
  page: z.string().max(80).default("/"),
});

/**
 * Vihaan chat over Server-Sent Events.
 *   event: delta  {text}               streamed answer text
 *   event: action {navigate}           the client should route to this path
 *   event: tool   {name}               progress hint ("Looking it up…")
 *   event: done   {mode, id, prompt}   mode "ai" | "instant" | "offline"; id is the interaction to rate
 *   event: error  {message}
 * Obvious navigation/FAQ is answered instantly without the model; without an API key Vihaan stays useful in offline mode.
 * Every answer is recorded in ai_interactions (LLMOps telemetry) and in Prometheus metrics.
 */
export function aiRouter(d: Deps) {
  const r = Router();
  const prompt = promptFor(d.config.AI_PROMPT_VERSION);

  r.post("/chat", authenticate(d.config.JWT_ACCESS_SECRET, false), limiter(d.kv, { prefix: "ai", limit: d.config.NODE_ENV === "test" ? 1000 : 300, windowMs: 10 * 60_000 }),
    validate({ body: chatSchema }), ah(async (req, res) => {
      const { messages, page } = req.body as z.infer<typeof chatSchema>;
      const t0 = Date.now(); let firstToken: number | null = null; let answer = ""; let navigatedTo: string | null = null;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const say = (text: string) => { if (firstToken === null) firstToken = Date.now() - t0; answer += text; send("delta", { text }); };
      const act = (a: { navigate: string }) => { navigatedTo = a.navigate; send("action", a); };
      const ctl = new AbortController(); res.on("close", () => ctl.abort());
      const last = messages[messages.length - 1].content;
      const base = { userId: req.user?.id ?? null, page, question: last.slice(0, 500), promptVersion: prompt.version, promptHash: prompt.hash };
      const finish = async (row: Partial<typeof aiInteractions.$inferInsert> & { mode: string }) => {
        const id = await recordInteraction(d, { ...base, ...row, answer: answer.slice(0, 2000), navigatedTo, latencyMs: Date.now() - t0, firstTokenMs: firstToken });
        if (!ctl.signal.aborted) send("done", { mode: row.mode === "error" ? "ai" : row.mode, id, prompt: prompt.version });
        res.end();
      };

      const intent = intentOf(last);
      if (intent || !d.llm) {
        const reply = intent ?? { text: await offlineAnswer(d, last) };
        if (intent && "navigate" in intent) act({ navigate: intent.navigate });
        say(reply.text); return finish({ mode: intent ? "instant" : "offline" });
      }

      // Model calls cost money: per-user (or per-IP for visitors — generous, campus NAT) quota + a global daily cap.
      const quota = await modelQuota(d, req.user?.id ? `u:${req.user.id}` : `ip:${req.ip ?? "anon"}`, !!req.user);
      if (quota) { say(`${quota}\n\n${await offlineAnswer(d, last)}`); return finish({ mode: "offline", error: "quota" }); }

      const llm = d.llm; const run = toolRunner(d, req.user?.id, act);
      const system = prompt.render(page, req.user?.role ?? "visitor");
      const convo: LlmMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      while (convo.length && convo[0].role !== "user") convo.shift();
      const tools: string[] = []; let rounds = 0, inTok = 0, outTok = 0; let stop: string | null = null;
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          // The tool list never changes mid-conversation: newer models reject a changed prefix once they have thought.
          const out = await llm.round({ system, messages: convo, tools: TOOLS }, say, ctl.signal);
          rounds++; inTok += out.usage?.input ?? 0; outTok += out.usage?.output ?? 0; stop = out.stop_reason;
          const uses = out.content.filter((b): b is Extract<LlmBlock, { type: "tool_use" }> => b.type === "tool_use");
          if (out.stop_reason !== "tool_use" || !uses.length) break;
          if (round === MAX_ROUNDS - 1) { say("\n\nI've gathered a lot — ask me something more specific and I'll narrow it down."); break; }
          // Replay the assistant turn verbatim (incl. signed thinking blocks), then the tool results.
          convo.push({ role: "assistant", content: out.raw ?? out.content });
          const results = await Promise.all(uses.map(async (u) => {
            send("tool", { name: u.name }); tools.push(u.name); aiTools.inc({ tool: u.name });
            try { return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(await run(u.name, u.input)).slice(0, 12_000) }; }
            catch (e) { return { type: "tool_result" as const, tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true }; }
          }));
          convo.push({ role: "user", content: results });
          if (out.content.some((b) => b.type === "text" && b.text.trim())) say("\n\n");
        }
        if (stop === "refusal") { aiErrors.inc({ kind: "refusal" }); say(answer ? "" : "I can't help with that one — but I can open a page or explain a game-theory idea."); }
        else if (stop === "max_tokens" && !answer.trim()) { aiErrors.inc({ kind: "max_tokens" }); say("That needs a longer answer than I can give here — try asking about one part at a time."); }
        const cost = costUsd(llm.model, inTok, outTok);
        aiTokens.inc({ direction: "input", model: llm.model }, inTok); aiTokens.inc({ direction: "output", model: llm.model }, outTok); aiCost.inc({ model: llm.model }, cost);
        if (firstToken !== null) aiFirstToken.observe(firstToken / 1000);
        return finish({ mode: "ai", model: llm.model, toolCalls: tools, rounds, inputTokens: inTok, outputTokens: outTok, costUsd: cost, stopReason: stop });
      } catch (e) {
        if (ctl.signal.aborted) return finish({ mode: "ai", model: llm.model, toolCalls: tools, rounds, inputTokens: inTok, outputTokens: outTok, costUsd: costUsd(llm.model, inTok, outTok), error: "client_aborted" });
        aiErrors.inc({ kind: "exception" });
        logger.warn({ err: (e as Error).message }, "vihaan model error");
        send("error", { message: "My circuits hiccupped — please try again in a moment." });
        return finish({ mode: "error", model: llm.model, toolCalls: tools, rounds, inputTokens: inTok, outputTokens: outTok, costUsd: costUsd(llm.model, inTok, outTok), error: (e as Error).message.slice(0, 300) });
      }
    }));

  /** Thumbs up/down on one answer. Anyone holding the (unguessable) interaction id may rate it once. */
  r.post("/feedback", authenticate(d.config.JWT_ACCESS_SECRET, false), limiter(d.kv, { prefix: "ai-fb", limit: 60, windowMs: 10 * 60_000 }),
    validate({ body: z.object({ id: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]), note: z.string().trim().max(500).optional() }) }), ah(async (req, res) => {
      const { id, rating, note } = req.body as { id: string; rating: 1 | -1; note?: string };
      const [row] = await d.db.update(aiInteractions).set({ rating, feedbackNote: note ?? null }).where(and(eq(aiInteractions.id, id), isNull(aiInteractions.rating))).returning({ id: aiInteractions.id });
      if (!row) throw notFound("Unrated answer");
      aiFeedback.inc({ rating: rating === 1 ? "up" : "down" });
      res.status(204).end();
    }));
  return r;
}

async function recordInteraction(d: Deps, row: typeof aiInteractions.$inferInsert) {
  aiRequests.inc({ mode: row.mode, model: row.model ?? "none", prompt: row.promptVersion ?? "none" });
  aiLatency.observe({ mode: row.mode }, row.latencyMs / 1000);
  try { const [r] = await d.db.insert(aiInteractions).values(row).returning({ id: aiInteractions.id }); return r.id; }
  catch (e) { logger.warn({ err: (e as Error).message }, "ai telemetry insert failed"); return null; }
}

/** Retention: question/answer text older than AI_LOG_RETENTION_DAYS is deleted (aggregates live on in Prometheus). */
export async function purgeAiLogs(d: Deps, now = new Date()) {
  const cutoff = new Date(now.getTime() - d.config.AI_LOG_RETENTION_DAYS * 864e5);
  const gone = await d.db.delete(aiInteractions).where(lt(aiInteractions.createdAt, cutoff)).returning({ id: aiInteractions.id });
  return gone.length;
}

/** Returns a user-facing message when the model may not be called right now, else null. */
async function modelQuota(d: Deps, who: string, signedIn: boolean): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  const [mine, today] = await Promise.all([d.kv.incr(`ai:q:${who}`, 600), d.kv.incr(`ai:day:${day}`, 2 * 86_400)]);
  if (today > d.config.AI_DAILY_CAP) return "My AI brain has hit today's budget, so I'm in offline mode until tomorrow.";
  if (mine > (signedIn ? d.config.AI_USER_QUOTA : d.config.AI_VISITOR_QUOTA)) return signedIn ? "You've asked a lot in the last few minutes — I'll switch to quick answers for a bit." : "Lots of visitors are asking from this network — sign in for more AI answers. Meanwhile:";
  return null;
}

function toolRunner(d: Deps, userId: string | undefined, onAction: (a: { navigate: string }) => void) {
  return async (name: string, input: Record<string, unknown>) => {
    switch (name) {
      case "navigate": {
        const page = String(input.page ?? "");
        if (!PAGES[page]) throw new Error(`Unknown page. Valid: ${Object.keys(PAGES).join(", ")}`);
        onAction({ navigate: page }); return `Opened ${PAGES[page]}.`;
      }
      case "get_club_snapshot": return snapshot(d);
      case "search_site": return search(d, String(input.query ?? ""));
      case "get_my_progress": {
        if (!userId) return { signedIn: false };
        const [u] = await d.db.select().from(users).where(eq(users.id, userId)); if (!u) return { signedIn: false };
        const [lb, att] = await Promise.all([leaderboard(d, 10_000), attendanceSummary(d, u.id, u.createdAt)]);
        const row = lb.find((x) => x.id === u.id);
        return { signedIn: true, name: u.name, points: row ?? { total: 0 }, rank: row ? lb.indexOf(row) + 1 : null, attendance: { ...att, ratePct: Math.round(att.rate * 100) } };
      }
      default: throw new Error("Unknown tool");
    }
  };
}
export async function snapshot(d: Deps) {
  const [up, nts, lb, open] = await Promise.all([
    d.db.select({ title: events.title, startsAt: events.startsAt, venue: events.venue, type: events.type }).from(events).where(gte(events.startsAt, new Date())).orderBy(asc(events.startsAt)).limit(5),
    d.db.select({ title: notices.title, body: notices.body, pinned: notices.pinned }).from(notices).orderBy(desc(notices.pinned), desc(notices.createdAt)).limit(4),
    leaderboard(d, 3),
    d.db.select({ title: sessions.title }).from(sessions).where(eq(sessions.status, "OPEN")),
  ]);
  return { upcomingEvents: up, notices: nts.map((n) => ({ ...n, body: n.body.slice(0, 200) })), leaderboardTop3: lb.map((x) => ({ name: x.name, points: x.total })), openAttendanceSessions: open.map((s) => s.title) };
}
export async function search(d: Deps, q: string) {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2).slice(0, 6); if (!words.length) return [];
  const score = (s: string) => words.reduce((a, w) => a + (s.toLowerCase().includes(w) ? 1 : 0), 0);
  const [mods, evs] = await Promise.all([
    d.db.select({ id: modules.id, code: modules.code, title: modules.title, short: modules.short, lessons: modules.lessons }).from(modules),
    d.db.select({ title: events.title, startsAt: events.startsAt, venue: events.venue }).from(events)
      .where(and(gte(events.startsAt, new Date(Date.now() - 30 * 864e5)), or(...words.map((w) => ilike(events.title, `%${w}%`))))).limit(5),
  ]);
  return [
    ...mods.map((m) => ({ page: `/learn/${m.id}`, title: `${m.code} ${m.title}`, about: m.short, s: score(`${m.title} ${m.short} ${m.lessons.map((l) => `${l.title} ${l.html.replace(/<[^>]+>/g, " ")}`).join(" ")}`) })),
    ...GAMES.map(([pg, title, about]) => ({ page: pg, title, about, s: score(`${title} ${about}`) })),
    ...evs.map((e) => ({ page: "/events", title: e.title, about: `${e.startsAt.toISOString().slice(0, 10)} · ${e.venue ?? "TBA"}`, s: 1 })),
  ].filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(({ s: _s, ...x }) => x);
}
async function offlineAnswer(d: Deps, text: string) {
  const t = text.toLowerCase();
  if (/event|this week|notice|happening/.test(t)) {
    const s = await snapshot(d);
    return s.upcomingEvents.length ? "Coming up:\n" + s.upcomingEvents.map((e) => `- **${e.title}** — ${e.startsAt.toISOString().slice(0, 10)} · ${e.venue ?? "TBA"}`).join("\n") : "No upcoming events are listed yet — keep an eye on **Notices**.";
  }
  const hits = await search(d, text);
  if (hits.length) return "Here's what I found:\n" + hits.slice(0, 4).map((h) => `- **${h.title}** — ${h.about}`).join("\n") + "\n\nSay “open” plus a name and I'll take you there.";
  return "I'm in offline mode right now, so I can open pages and answer quick questions. Try “open the Arena”, “what's on this week?” or “how do I check in?”.";
}
