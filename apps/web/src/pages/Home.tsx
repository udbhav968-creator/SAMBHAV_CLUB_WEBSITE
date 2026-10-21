import { Fragment, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Empty, Loading } from "../components/ui";
import { GameTile } from "../components/GameArt";
import { fdate } from "../lib/format";
import { useFx } from "../lib/fx";
import { GAMES, MOD_GRAD, TERMS } from "./catalog";
import type { ModuleRow } from "./Learn";

interface Stats { members: number; upcomingEvents: number; sessionsHeld: number; averageAttendance: number }
export interface EventRow { id: string; title: string; type: string; startsAt: string; venue: string | null; capacity: number | null; description: string | null; registered: number; isRegistered: boolean }
export interface NoticeRow { id: string; title: string; body: string; tag: string; pinned: boolean; createdAt: string; author: string | null }
interface LB { leaderboard: { id: string; name: string; total: number }[] }

const A = [[3, 0], [5, 1]], B = [[3, 5], [0, 1]], L = ["Cooperate", "Defect"];
function Matrix() {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const dev = (i: number, j: number) => [A[1 - i][j] > A[i][j], B[i][1 - j] > B[i][j]] as const;
  const note = !sel ? "Click a cell. We'll show whether either player wants to move away from it." : (() => { const [r, c] = dev(...sel);
    return !r && !c ? "Nash equilibrium. Neither player gains by switching alone — yet both would prefer (3, 3)." : [r && `Row would switch to ${L[1 - sel[0]]}.`, c && `Column would switch to ${L[1 - sel[1]]}.`].filter(Boolean).join(" "); })();
  return <><div className="cap"><span>Try it · Prisoner's Dilemma</span><span>(row, col)</span></div>
    <div className="hm"><span /><span className="h">Cooperate</span><span className="h">Defect</span>
      {[0, 1].map((i) => <Fragment key={i}><span className="h">{L[i]}</span>{[0, 1].map((j) => { const ne = sel && sel[0] === i && sel[1] === j && !dev(i, j)[0] && !dev(i, j)[1];
        return <button key={`${i}${j}`} className={`c ${ne ? "ne" : ""}`} onClick={() => setSel([i, j])}>(<span className="a">{A[i][j]}</span>, <span className="b">{B[i][j]}</span>)</button>; })}</Fragment>)}</div>
    <p className="note">{note}</p></>;
}

export default function Home() {
  const { user } = useAuth(); const ref = useRef<HTMLDivElement>(null);
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats") });
  const events = useQuery({ queryKey: ["events", "upcoming"], queryFn: () => api<{ events: EventRow[] }>("/events?scope=upcoming") });
  const notices = useQuery({ queryKey: ["notices"], queryFn: () => api<{ notices: NoticeRow[] }>("/notices") });
  const mods = useQuery({ queryKey: ["modules"], queryFn: () => api<{ modules: ModuleRow[] }>("/modules") });
  const lb = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<LB>("/leaderboard?limit=3") });
  useFx(ref, [stats.data?.members]);
  const s = stats.data; const top = lb.data?.leaderboard ?? []; const up = events.data?.events ?? [];
  const words = ["cooperate.", "bluff.", "bid.", "defect.", "outthink."];
  return <div ref={ref}>
    <section className="hero"><canvas className="field" aria-hidden="true" /><div className="wrap">
      <div>
        <span className="chip-live enter"><b>NEW</b> The Arena is live — eight games, real theory</span>
        <h1 className="enter d1"><span className="line">Every choice</span><span className="line">is a <span className="grad-text">strategy.</span></span>
          <span className="line" style={{ fontSize: ".62em", marginTop: ".25em", color: "var(--muted)" }}>Learn when to <span className="rotator">{words.map((w, i) => <span key={w} className={i ? "" : "on"} style={{ color: "var(--ink)" }}>{w}</span>)}</span></span></h1>
        <p className="lede enter d2">Sambhav is the student society for game theory, probability and decision science. We learn it by playing it — then prove it in tournaments, research and code.</p>
        <div className="ctas enter d3"><Link className="btn primary lg" to="/arena" data-magnetic>Enter the Arena <span className="arr">→</span></Link>{user ? <Link className="btn lg" to="/learn" data-magnetic>Start learning</Link> : <Link className="btn accent lg" to="/register" data-magnetic>Join Sambhav</Link>}</div>
        <div className="trust enter d4"><div><b data-count="8">8</b>playable games</div><div><b data-count="6">6</b>learning modules</div><div><b data-count="36">36</b>Bloom-tagged questions</div><div><b data-count={s?.members ?? 0}>{s?.members ?? "—"}</b>members</div></div>
      </div>
      <div className="stage enter d3">
        <div className="float f1 hero-matrix spot"><Matrix /></div>
        <div className="float f2"><div className="row" style={{ gap: 14, flexWrap: "nowrap" }}><div className="mini-wheel" /><div><div className="eyebrow" style={{ color: "var(--accent)" }}>House edge</div><b style={{ font: "800 1.7rem var(--f-display)", color: "var(--ink)" }}>−2.70%</b><div className="small muted">on every bet. Always.</div></div></div></div>
        <div className="float f3"><div className="eyebrow">Live attendance</div><div className="code-demo" style={{ fontSize: "1.6rem", margin: "6px 0" }}>4<span className="d">8</span>2·9<span className="d">1</span>7</div><div className="spark">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div></div>
      </div>
    </div></section>
    <div className="marquee" aria-hidden="true"><div className="track">{[...TERMS, ...TERMS].map((t, i) => <span key={i}>{t}</span>)}</div></div>
    <section className="band tight"><div className="wrap">
      <div className="stats reveal"><div><b data-count={s?.members ?? 0}>{s?.members ?? "—"}</b><span>Members</span></div><div><b data-count={s?.upcomingEvents ?? 0}>{s?.upcomingEvents ?? "—"}</b><span>Upcoming events</span></div><div><b data-count={s?.sessionsHeld ?? 0}>{s?.sessionsHeld ?? "—"}</b><span>Sessions held</span></div><div><b data-count={s ? Math.round(s.averageAttendance * 100) : 0} data-suffix="%">{s ? `${Math.round(s.averageAttendance * 100)}%` : "—"}</b><span>Average attendance</span></div></div>
    </div></section>
    <section className="band"><div className="wrap">
      <div className="sechead reveal"><div><div className="eyebrow">What we do</div><h2 style={{ marginTop: 10 }}>A club built like a <span className="grad-text">research lab</span>,<br />run like a game night.</h2></div><p>Every activity here is something members actually do — play, study, compete, show up — and every one of them is tracked.</p></div>
      <div className="bento">
        <Link className="b b-1 spot reveal-s" to="/arena" data-tilt><span className="bg" style={{ background: "#8b6cff" }} /><div className="eyebrow">The Arena</div><h3>Eight games. Each one a theorem you can feel.</h3><p className="muted">Provably-fair roulette, Axelrod tournaments, auctions, bargaining, a Nash solver and live multiplayer rounds.</p>
          <div className="row" style={{ gap: 18, marginTop: 10 }}><div className="pv-wheel" /><div className="pv-cd"><i>C</i><i>D</i><i>C</i><i>D</i></div></div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>{GAMES.map((g) => <span key={g.id} className="pill" style={{ background: g.gg, color: "#fff", border: 0 }}>{g.title}</span>)}</div><span className="go">Play now <span className="arr">→</span></span></Link>
        <Link className="b b-2 spot reveal-s" to="/leaderboard" data-tilt><span className="bg" style={{ background: "#ffb224" }} /><div className="eyebrow" style={{ color: "var(--accent)" }}>Leaderboard</div><h3>Points for play, learning and showing up.</h3>
          <div className="podium">{[top[1], top[0], top[2]].map((r, i) => <div key={i} title={r?.name}>{r ? r.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : ["2", "1", "3"][i]}</div>)}</div><span className="go">See rankings <span className="arr">→</span></span></Link>
        <Link className="b b-3 spot reveal-s" to="/learn" data-tilt><span className="bg" style={{ background: "#22d3ee" }} /><div className="eyebrow">Learn</div><h3>6 modules · 15 hours</h3><p className="muted small">Outcomes, lessons and quizzes from Remember to Create.</p><div className="row" style={{ gap: 4 }}>{["L1", "L2", "L3", "L4", "L5", "L6"].map((k) => <span key={k} className={`bloom ${k}`}>{k}</span>)}</div></Link>
        <Link className="b b-4 spot reveal-s" to="/attendance" data-tilt><span className="bg" style={{ background: "#2fe39e" }} /><div className="eyebrow" style={{ color: "var(--good)" }}>Attendance</div><h3>QR codes that expire in 30 s.</h3><p className="muted small">Verified on the server. No proxies.</p></Link>
        <Link className="b b-5 spot reveal-s" to="/events" data-tilt><span className="bg" style={{ background: "#ff4f8b" }} /><div className="eyebrow" style={{ color: "var(--hot)" }}>Events</div><h3>{up[0]?.title ?? "Tournaments & talks"}</h3><p className="muted small">{up[0] ? `${fdate(up[0].startsAt)} · ${up[0].venue ?? "TBA"}` : "Workshops, Axelrod Cup, Nash Night."}</p></Link>
      </div></div></section>
    <section className="band alt"><div className="wrap pillars">
      <div className="sticky reveal-l"><div className="eyebrow">How Sambhav works</div><h2 style={{ marginTop: 10 }}>Four programmes.<br /><span className="grad-text">One way of thinking.</span></h2><p className="lede" style={{ marginTop: 14 }}>A competition circuit, a curriculum, a research circle — and a tech team that builds the tools.</p></div>
      <div>{[["01", "Compete", "Arena nights every week and a flagship Axelrod Cup each term.", ["Tournaments", "Live leaderboard"]], ["02", "Learn", "Six modules from dominance to mechanism design, assessed across Bloom's taxonomy.", ["GT-101 → GT-302", "Quizzes"]],
        ["03", "Research", "Reading circle on Nash, Axelrod, Vickrey and Myerson, plus student projects.", ["Paper club", "Projects"]], ["04", "Build", "Provably-fair games, TOTP attendance and real-time consoles — built by members.", ["Full-stack", "Open source"]]]
        .map(([n, t, d, tags]) => <div key={n as string} className="pillar reveal"><div className="n">{n}</div><div><h3>{t}</h3><p>{d}</p><div className="tags">{(tags as string[]).map((x) => <span key={x} className="pill brand">{x}</span>)}</div></div></div>)}</div>
    </div></section>
    <section className="band"><div className="wrap"><div className="sechead reveal"><div><div className="eyebrow">From the Arena</div><h2 style={{ marginTop: 10 }}>Play the theory.</h2></div><Link className="btn" to="/arena">All games <span className="arr">→</span></Link></div>
      <div className="grid g3">{GAMES.slice(0, 3).map((g) => <GameTile key={g.id} g={g} />)}</div></div></section>
    <section className="band alt"><div className="wrap"><div className="sechead reveal"><div><div className="eyebrow">Learning path</div><h2 style={{ marginTop: 10 }}>From first principles to <span className="grad-text">mechanism design.</span></h2></div><Link className="btn" to="/learn">Open the curriculum <span className="arr">→</span></Link></div>
      <div className="path">{mods.data?.modules.map((m, i) => <Link key={m.id} className="step spot reveal" to={`/learn/${m.id}`}><span className="k" style={{ background: MOD_GRAD[i] }}>{m.code.slice(3)}</span><h3>{m.title}</h3><p className="muted small" style={{ marginTop: 6 }}>{m.short}</p><div className="small muted" style={{ marginTop: 10 }}>{m.hours} h · {m.lessonCount} lessons · 6 questions</div></Link>)}</div></div></section>
    <section className="band"><div className="wrap split">
      <div className="card pad-lg spot reveal"><div className="sechead" style={{ marginBottom: 6 }}><h2 style={{ fontSize: "1.5rem" }}>Upcoming events</h2><Link to="/events" className="small">All events →</Link></div>
        {events.isLoading ? <Loading /> : up.length ? up.slice(0, 3).map((e) => <EventLine key={e.id} e={e} />) : <Empty title="No upcoming events yet">Coordinators will post the next meet here.</Empty>}</div>
      <div className="card pad-lg spot reveal"><div className="sechead" style={{ marginBottom: 6 }}><h2 style={{ fontSize: "1.5rem" }}>Notice board</h2><Link to="/notices" className="small">All →</Link></div>
        {notices.isLoading ? <Loading /> : notices.data?.notices.length ? notices.data.notices.slice(0, 4).map((n) => <div key={n.id} className="notice"><h4>{n.pinned && <span className="pill accent" style={{ marginRight: 6 }}>Pinned</span>}{n.title}</h4><p>{n.body}</p></div>) : <Empty title="No notices yet" />}</div>
    </div></section>
    <section className="band"><div className="wrap"><div className="ctaband reveal-s"><div className="eyebrow" style={{ color: "#a5f3fc" }}>Join the society</div><h2 style={{ marginTop: 12 }}>Your next move<br />starts here.</h2><p>Membership is open to every programme and every year. Bring curiosity; we'll bring the payoff matrices.</p>
      <div className="row" style={{ marginTop: 26 }}><Link className="btn lg" to={user ? "/me" : "/register"} data-magnetic>{user ? "Open My Sambhav" : "Join Sambhav"} <span className="arr">→</span></Link><Link className="btn ghost lg" to="/events">See events</Link></div></div></div></section>
  </div>;
}
export function EventLine({ e, action }: { e: EventRow; action?: React.ReactNode }) {
  const d = new Date(e.startsAt);
  return <div className="ev"><div className="date"><div className="m">{d.toLocaleString("en", { month: "short" })}</div><div className="d">{d.getDate()}</div></div>
    <div style={{ minWidth: 0 }}><h4>{e.title}</h4><div className="small muted">{e.type} · {fdate(e.startsAt)} {d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {e.venue ?? "TBA"} · {e.registered}{e.capacity ? `/${e.capacity}` : ""} registered</div>{e.description && <p className="small" style={{ marginTop: 4 }}>{e.description}</p>}</div>
    <div className="act row">{action}</div></div>;
}
