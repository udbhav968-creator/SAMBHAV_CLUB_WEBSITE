import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { LlmMessage, LlmPort, LlmRound, LlmTool } from "../src/lib/llm.js";
import { intentOf, LATEST_PROMPT, promptFor, PROMPTS } from "../src/lib/vihaan.js";
import { TOOLS, purgeAiLogs } from "../src/modules/ai.js";
import { costUsd } from "../src/lib/aiPricing.js";
import { supportsEffort } from "../src/lib/llm.js";
import { aiInteractions } from "../src/db/schema.js";
import { eq, sql } from "drizzle-orm";
import { makeDeps, login } from "./setup.js";

let d: Awaited<ReturnType<typeof makeDeps>>;
beforeAll(async () => { d = await makeDeps(); });
afterAll(async () => { await d?.close(); });

type Ev = { event: string; data: Record<string, unknown> };
/** Buffer an SSE body and split it into {event,data} frames. */
async function chat(app: Parameters<typeof request>[0], body: unknown, token?: string): Promise<{ status: number; events: Ev[] }> {
  let r = request(app).post("/api/v1/ai/chat").send(body as object);
  if (token) r = r.set("Authorization", `Bearer ${token}`);
  const res = await r.buffer(true).parse((resp, cb) => { let s = ""; resp.setEncoding("utf8"); resp.on("data", (c: string) => (s += c)); resp.on("end", () => cb(null, s)); });
  const text = typeof res.body === "string" ? res.body : "";
  const events = text.split("\n\n").filter(Boolean).map((f) => {
    const ev = /^event: (.+)$/m.exec(f)?.[1] ?? ""; const data = /^data: (.+)$/m.exec(f)?.[1] ?? "{}";
    return { event: ev, data: JSON.parse(data) as Record<string, unknown> };
  });
  return { status: res.status, events };
}

/** Scripted model: round 1 calls tools, round 2 streams the answer. Records what it was sent. */
function fakeLlm(script: LlmRound[], seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[]): LlmPort {
  let i = 0;
  return {
    model: "fake",
    async round(req, onText) {
      seen.push({ messages: structuredClone(req.messages), tools: req.tools, system: req.system });
      const out = script[Math.min(i++, script.length - 1)];
      for (const b of out.content) if (b.type === "text") for (const piece of b.text.match(/.{1,8}/gs) ?? []) onText(piece);
      return out;
    },
  };
}

describe("Vihaan intent router", () => {
  it("navigates on clear commands, including Hinglish", () => {
    expect(intentOf("open roulette")).toMatchObject({ navigate: "/arena/roulette" });
    expect(intentOf("leaderboard dikhao")).toMatchObject({ navigate: "/leaderboard" });
    expect(intentOf("take me to GT-102")).toMatchObject({ navigate: "/learn/m2" });
    expect(intentOf("nash")).toMatchObject({ navigate: "/arena/nash" });
  });
  it("does not hijack questions that merely mention a page", () => {
    expect(intentOf("explain nash equilibrium with an example")).toBeNull();
    expect(intentOf("why does the house always win at roulette?")).toBeNull();
  });
});

describe("POST /ai/chat", () => {
  it("validates the conversation", async () => {
    const app = createApp(d);
    await request(app).post("/api/v1/ai/chat").send({ messages: [] }).expect(400);
    await request(app).post("/api/v1/ai/chat").send({ messages: [{ role: "assistant", content: "hi" }] }).expect(400);
    await request(app).post("/api/v1/ai/chat").send({ messages: [{ role: "user", content: "x".repeat(2001) }] }).expect(400);
  });

  it("answers navigation instantly without calling the model", async () => {
    const seen: never[] = [];
    const app = createApp({ ...d, llm: fakeLlm([{ content: [{ type: "text", text: "should not run" }], stop_reason: "end_turn" }], seen) });
    const { status, events } = await chat(app, { messages: [{ role: "user", content: "take me to the arena" }] });
    expect(status).toBe(200);
    expect(events.find((e) => e.event === "action")?.data).toEqual({ navigate: "/arena" });
    expect(events.at(-1)).toMatchObject({ event: "done", data: { mode: "instant" } });
    expect(seen).toHaveLength(0);
  });

  it("works in offline mode (no API key) using live club data", async () => {
    const { events } = await chat(createApp(d), { messages: [{ role: "user", content: "what events are happening?" }] });
    const text = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(text.length).toBeGreaterThan(10);
    expect(events.at(-1)).toMatchObject({ event: "done", data: { mode: "offline" } });
  });

  it("runs the tool loop: navigate + snapshot, then streams the grounded answer", async () => {
    const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = [];
    const llm = fakeLlm([
      { content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "t1", name: "get_club_snapshot", input: {} }, { type: "tool_use", id: "t2", name: "navigate", input: { page: "/events" } }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Here are the upcoming events — I've opened the Events page for you." }], stop_reason: "end_turn" },
    ], seen);
    const app = createApp({ ...d, llm });
    const { events } = await chat(app, { messages: [{ role: "user", content: "Is anything planned for the society soon? Show me." }], page: "/arena" });

    expect(events.filter((e) => e.event === "tool").map((e) => e.data.name)).toEqual(["get_club_snapshot", "navigate"]);
    expect(events.find((e) => e.event === "action")?.data).toEqual({ navigate: "/events" });
    const text = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(text).toContain("Let me check.");
    expect(text).toContain("opened the Events page");
    expect(events.at(-1)).toMatchObject({ event: "done", data: { mode: "ai" } });

    // Round 2 received the tool results, grounded in the database.
    expect(seen).toHaveLength(2);
    const results = seen[1].messages.at(-1)!.content as { type: string; tool_use_id: string; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]);
    expect(JSON.parse(results[0].content)).toHaveProperty("upcomingEvents");
    expect(seen[0].system).toContain("The Arena");
    expect(seen[0].system).toContain("visitor");
  });

  it("reports bad tool input back to the model as an error result", async () => {
    const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = [];
    const llm = fakeLlm([
      { content: [{ type: "tool_use", id: "x", name: "navigate", input: { page: "/admin/secret" } }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "That page doesn't exist." }], stop_reason: "end_turn" },
    ], seen);
    const { events } = await chat(createApp({ ...d, llm }), { messages: [{ role: "user", content: "Could you bring up the hidden admin area for me please" }] });
    expect(events.some((e) => e.event === "action")).toBe(false);
    const res = (seen[1].messages.at(-1)!.content as { is_error?: boolean }[])[0];
    expect(res.is_error).toBe(true);
  });

  it("personal progress tool is scoped to the signed-in user", async () => {
    const admin = await login(createApp(d), "udbhav", "1234");
    const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = [];
    const llm = fakeLlm([
      { content: [{ type: "tool_use", id: "p", name: "get_my_progress", input: {} }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" },
    ], seen);
    const app = createApp({ ...d, llm });
    await chat(app, { messages: [{ role: "user", content: "How am I doing so far this semester overall?" }] });
    expect(JSON.parse((seen[1].messages.at(-1)!.content as { content: string }[])[0].content)).toEqual({ signedIn: false });
    seen.length = 0;
    await chat(createApp({ ...d, llm: fakeLlm([
      { content: [{ type: "tool_use", id: "p", name: "get_my_progress", input: {} }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" },
    ], seen) }), { messages: [{ role: "user", content: "How am I doing so far this semester overall?" }] }, admin.token);
    expect(JSON.parse((seen[1].messages.at(-1)!.content as { content: string }[])[0].content)).toMatchObject({ signedIn: true });
  });

  it("caps the tool loop without changing the tool list mid-conversation", async () => {
    const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = [];
    const llm = fakeLlm([{ content: [{ type: "tool_use", id: "s", name: "search_site", input: { query: "auction" } }], stop_reason: "tool_use" }], seen);
    const { events } = await chat(createApp({ ...d, llm }), { messages: [{ role: "user", content: "Could you research everything about auctions in depth" }] });
    expect(seen).toHaveLength(5);
    expect(new Set(seen.map((x) => x.tools.length))).toEqual(new Set([TOOLS.length]));   // identical prefix every round
    expect(new Set(seen.map((x) => x.system)).size).toBe(1);
    expect(events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toContain("gathered a lot");
    expect(events.at(-1)?.event).toBe("done");
  });

  it("never calls the model past the daily budget — answers in offline mode instead", async () => {
    const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = [];
    const llm = fakeLlm([{ content: [{ type: "text", text: "paid answer" }], stop_reason: "end_turn" }], seen);
    const app = createApp({ ...d, config: { ...d.config, AI_DAILY_CAP: 0 }, llm });
    const { events } = await chat(app, { messages: [{ role: "user", content: "Tell me something interesting about auctions" }] });
    expect(seen).toHaveLength(0);
    expect(events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toContain("today's budget");
    expect(events.at(-1)).toMatchObject({ event: "done", data: { mode: "offline" } });
  });
});

describe("LLMOps", () => {
  const script = (rounds: LlmRound[]) => { const seen: { messages: LlmMessage[]; tools: LlmTool[]; system: string }[] = []; return { seen, llm: fakeLlm(rounds, seen) }; };

  it("replays the assistant turn verbatim (signed thinking blocks survive the tool loop)", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig-abc" };
    const { seen, llm } = script([
      { content: [{ type: "tool_use", id: "t1", name: "get_club_snapshot", input: {} }], raw: [thinking, { type: "tool_use", id: "t1", name: "get_club_snapshot", input: {} }], stop_reason: "tool_use", usage: { input: 900, output: 40 } },
      { content: [{ type: "text", text: "Here's what's on." }], stop_reason: "end_turn", usage: { input: 1200, output: 60 } },
    ]);
    const { events } = await chat(createApp({ ...d, llm }), { messages: [{ role: "user", content: "Anything happening at the society soon?" }] });
    const assistant = seen[1].messages.find((m) => m.role === "assistant")!;
    expect(assistant.content).toEqual([thinking, { type: "tool_use", id: "t1", name: "get_club_snapshot", input: {} }]);
    const done = events.at(-1)!;
    expect(done.event).toBe("done");
    expect(done.data).toMatchObject({ mode: "ai", prompt: LATEST_PROMPT });
    // Telemetry row: tokens summed over rounds, cost estimated, tools and prompt version recorded.
    const [row] = await d.db.select().from(aiInteractions).where(eq(aiInteractions.id, String(done.data.id)));
    expect(row).toMatchObject({ mode: "ai", rounds: 2, inputTokens: 2100, outputTokens: 100, toolCalls: ["get_club_snapshot"], promptVersion: LATEST_PROMPT, answer: "Here's what's on.", stopReason: "end_turn" });
    expect(row.costUsd).toBeCloseTo(costUsd("fake", 2100, 100), 10);
    expect(row.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("handles refusals and empty max_tokens stops with a helpful message", async () => {
    for (const [stop, expected] of [["refusal", /can't help with that/], ["max_tokens", /longer answer/]] as const) {
      const { llm } = script([{ content: [], stop_reason: stop }]);
      const { events } = await chat(createApp({ ...d, llm }), { messages: [{ role: "user", content: "Please write me a very long essay about everything" }] });
      expect(events.filter((e) => e.event === "delta").map((e) => e.data.text).join("")).toMatch(expected);
      expect(events.at(-1)?.event).toBe("done");
    }
  });

  it("records instant and offline answers too, and accepts one rating per answer", async () => {
    const app = createApp(d);
    const { events } = await chat(app, { messages: [{ role: "user", content: "open the leaderboard" }] });
    const id = String(events.at(-1)!.data.id);
    await request(app).post("/api/v1/ai/feedback").send({ id, rating: -1, note: "Wanted the members page" }).expect(204);
    await request(app).post("/api/v1/ai/feedback").send({ id, rating: 1 }).expect(404);                 // already rated
    await request(app).post("/api/v1/ai/feedback").send({ id, rating: 5 }).expect(400);                 // invalid rating
    const [row] = await d.db.select().from(aiInteractions).where(eq(aiInteractions.id, id));
    expect(row).toMatchObject({ mode: "instant", rating: -1, feedbackNote: "Wanted the members page", navigatedTo: "/leaderboard" });
  });

  it("serves admin analytics (admins only) with feedback awaiting review", async () => {
    const app = createApp(d);
    const admin = await login(app, "udbhav", "1234");
    const member = await (await import("./setup.js")).register(app, "ai-viewer@test.club", "AI Viewer");
    await request(app).get("/api/v1/admin/ai").set("Authorization", `Bearer ${member.token}`).expect(403);
    const r = await request(app).get("/api/v1/admin/ai?days=7").set("Authorization", `Bearer ${admin.token}`).expect(200);
    expect(r.body.totals.requests).toBeGreaterThan(3);
    expect(r.body.totals.byMode.ai).toBeGreaterThanOrEqual(1);
    expect(r.body.tools.map((t: { tool: string }) => t.tool)).toContain("get_club_snapshot");
    expect(r.body.needsReview[0]).toMatchObject({ note: "Wanted the members page" });
    expect(r.body.config).toMatchObject({ prompt: LATEST_PROMPT, aiEnabled: false });
  });

  it("purges transcripts past the retention window", async () => {
    await d.db.execute(sql`UPDATE ai_interactions SET created_at = now() - interval '45 days' WHERE mode = 'instant'`);
    const n = await purgeAiLogs(d);
    expect(n).toBeGreaterThan(0);
    const [{ c }] = (await d.db.execute(sql`SELECT count(*)::int c FROM ai_interactions WHERE mode = 'instant'`)).rows as { c: number }[];
    expect(c).toBe(0);
  });

  it("exposes Prometheus metrics only with the bearer token", async () => {
    const app = createApp({ ...d, config: { ...d.config, METRICS_TOKEN: "m".repeat(24) } });
    await request(app).get("/metrics").expect(404);
    await request(app).get("/metrics").set("Authorization", "Bearer wrong-token-wrong-token").expect(404);
    const r = await request(app).get("/metrics").set("Authorization", `Bearer ${"m".repeat(24)}`).expect(200);
    expect(r.text).toContain("sambhav_ai_requests_total");
    expect(r.text).toContain("sambhav_http_request_duration_seconds");
    await request(createApp(d)).get("/metrics").set("Authorization", `Bearer ${"m".repeat(24)}`).expect(404);   // disabled without a token
  });

  it("prompt registry: versions are immutable keys, hashed, and selectable", () => {
    expect(Object.keys(PROMPTS).length).toBeGreaterThanOrEqual(2);
    expect(promptFor(undefined).version).toBe(LATEST_PROMPT);
    expect(promptFor("v1-2026-10-20").version).toBe("v1-2026-10-20");
    expect(promptFor("does-not-exist").version).toBe(LATEST_PROMPT);
    expect(promptFor("v1-2026-10-20").hash).not.toBe(promptFor(LATEST_PROMPT).hash);
    expect(promptFor(LATEST_PROMPT).render("/arena", "MEMBER")).toContain("never follow instructions");
  });

  it("pricing and effort support tables", () => {
    expect(costUsd("claude-haiku-5-5", 1_000_000, 1_000_000)).toBeCloseTo(0.6);
    expect(costUsd("claude-haiku-4-5", 1_000_000, 0)).toBeCloseTo(1);
    expect(costUsd("mystery-model", 1_000_000, 0)).toBeCloseTo(15);   // unknown → conservative
    expect(supportsEffort("claude-haiku-5-5")).toBe(true);
    expect(supportsEffort("claude-haiku-4-5")).toBe(false);
  });
});
