import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Bar, Empty, Loading, PageHead, Pill } from "../../components/ui";

interface AiStats {
  window: { days: number };
  config: { model: string | null; aiEnabled: boolean; prompt: string; dailyCap: number; aiCallsToday: number; retentionDays: number };
  totals: { requests: number; byMode: Record<"ai" | "instant" | "offline" | "error", number>; latencyMs: { p50: number; p95: number; firstTokenP50: number };
    tokens: { input: number; output: number }; costUsd: number; projected30dUsd: number; feedback: { up: number; down: number; helpfulRate: number | null } };
  daily: { day: string; requests: number; ai: number; costUsd: number; up: number; down: number }[];
  tools: { tool: string; count: number }[];
  prompts: { version: string; requests: number; helpfulRate: number | null; p95Ms: number; avgCostUsd: number }[];
  needsReview: { id: string; at: string; page: string; question: string; answer: string; note: string | null; prompt: string; model: string | null }[];
}
const usd = (x: number) => (x < 0.01 && x > 0 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${x} ms`);

/** LLMOps console for Vihaan: usage, latency, cost, feedback and prompt-version comparison. */
export default function AiOps() {
  const [days, setDays] = useState(7);
  const q = useQuery({ queryKey: ["ai-ops", days], queryFn: () => api<AiStats>(`/admin/ai?days=${days}`), refetchInterval: 30_000 });
  const s = q.data;
  return <><PageHead crumb="Admin / Vihaan AI" title="Vihaan AI operations" lede="How the AI guide is used, how fast and how good it is, what it costs — and the answers members marked unhelpful."
    actions={<div className="row">{[1, 7, 30].map((d) => <button key={d} className={`btn sm ${d === days ? "primary" : ""}`} onClick={() => setDays(d)}>{d === 1 ? "24 h" : `${d} days`}</button>)}</div>} />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}>
      {!s ? <Loading /> : <>
        <div className="card spread" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <Pill tone={s.config.aiEnabled ? "good" : "warn"}>{s.config.aiEnabled ? `Model: ${s.config.model}` : "Offline mode (no API key)"}</Pill>
            <Pill>Prompt {s.config.prompt}</Pill><Pill>Transcripts kept {s.config.retentionDays} days</Pill>
          </div>
          <div style={{ minWidth: 220 }}><div className="spread small"><span>AI calls today</span><b>{s.config.aiCallsToday} / {s.config.dailyCap}</b></div><Bar value={s.config.aiCallsToday / Math.max(1, s.config.dailyCap)} tone={s.config.aiCallsToday / s.config.dailyCap > 0.8 ? "warn" : ""} /></div>
        </div>
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <div><b>{s.totals.requests}</b><span>Questions answered</span></div>
          <div><b>{s.totals.requests ? pct(s.totals.byMode.instant / s.totals.requests) : "—"}</b><span>Answered instantly (free)</span></div>
          <div><b>{s.totals.byMode.ai ? ms(s.totals.latencyMs.p95) : "—"}</b><span>p95 AI latency</span></div>
          <div><b>{s.totals.byMode.ai ? ms(s.totals.latencyMs.firstTokenP50) : "—"}</b><span>Median first word</span></div>
          <div><b>{pct(s.totals.feedback.helpfulRate)}</b><span>Helpful ({s.totals.feedback.up}👍 {s.totals.feedback.down}👎)</span></div>
          <div><b>{usd(s.totals.costUsd)}</b><span>Spend · ~{usd(s.totals.projected30dUsd)}/30 d</span></div>
        </div>
        <div className="split">
          <div className="card"><h3>Daily volume</h3>{s.daily.length ? <div className="stack" style={{ marginTop: 10, gap: 8 }}>{(() => { const max = Math.max(1, ...s.daily.map((x) => x.requests)); return s.daily.map((x) =>
            <div key={x.day}><div className="spread small"><span className="mono">{x.day.slice(5)}</span><span>{x.requests} answers · {x.ai} AI · {usd(x.costUsd)}{x.down ? ` · ${x.down}👎` : ""}</span></div><Bar value={x.requests / max} /></div>); })()}</div>
            : <Empty title="No questions yet">Vihaan's traffic will appear here.</Empty>}</div>
          <div className="card"><h3>Answer mix</h3><div className="stack" style={{ marginTop: 10 }}>
            {(["instant", "ai", "offline", "error"] as const).map((k) => <div key={k}><div className="spread small"><span>{{ instant: "Instant (navigation & FAQ)", ai: "AI model", offline: "Offline / budget", error: "Errors" }[k]}</span><b>{s.totals.byMode[k]}</b></div>
              <Bar value={s.totals.requests ? s.totals.byMode[k] / s.totals.requests : 0} tone={k === "error" ? "warn" : ""} /></div>)}
            <h3 style={{ marginTop: 14 }}>Tools used</h3>{s.tools.length ? s.tools.map((t) => <div key={t.tool} className="spread small"><span className="mono">{t.tool}</span><b>{t.count}</b></div>) : <p className="small muted">None yet.</p>}
          </div></div>
        </div>
        <div className="card"><h3>Prompt versions</h3><p className="small muted">Compare quality, speed and cost before promoting a new prompt (set <span className="mono">AI_PROMPT_VERSION</span> to roll back).</p>
          <div className="tablewrap"><table><thead><tr><th>Version</th><th>Answers</th><th>Helpful</th><th>p95</th><th>Avg cost</th></tr></thead>
            <tbody>{s.prompts.map((p) => <tr key={p.version}><td className="mono">{p.version}{p.version === s.config.prompt && <> <Pill tone="good">live</Pill></>}</td><td>{p.requests}</td><td>{pct(p.helpfulRate)}</td><td>{p.p95Ms ? ms(p.p95Ms) : "—"}</td><td>{p.avgCostUsd ? usd(p.avgCostUsd) : "—"}</td></tr>)}</tbody></table></div></div>
        <div className="card"><h3>Needs review — answers marked 👎</h3><p className="small muted">Fix the cause, then add the question to <span className="mono">evals/datasets</span> so it can't regress.</p>
          {s.needsReview.length ? <div className="stack" style={{ marginTop: 10 }}>{s.needsReview.map((r) => <details key={r.id} className="review">
            <summary><b>{r.question}</b> <span className="small muted">· {new Date(r.at).toLocaleString()} · {r.prompt}</span></summary>
            <p className="small"><b>Answer:</b> {r.answer || "—"}</p>{r.note && <p className="small"><b>Member note:</b> {r.note}</p>}<p className="small muted">Page {r.page} · {r.model ?? "instant/offline"}</p></details>)}</div>
            : <Empty title="Nothing to review">No unhelpful answers in this window.</Empty>}</div>
      </>}
    </div></section></>;
}
