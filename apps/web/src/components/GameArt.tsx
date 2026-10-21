import { Link } from "react-router-dom";
import { GAMES } from "../pages/catalog";

type G = (typeof GAMES)[number];
export function Preview({ pv }: { pv: G["pv"] }) {
  if (pv === "wheel") return <div className="pv-wheel" />;
  if (pv === "cd") return <div className="pv-cd"><i>C</i><i>D</i><i>C</i><i>D</i></div>;
  if (pv === "bars") return <div className="pv-bars">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>;
  if (pv === "rps") return <div className="pv-rps"><span>✊</span><span>✋</span><span>✌</span></div>;
  if (pv === "grid") return <div className="pv-grid"><i /><i /><i /><i /></div>;
  if (pv === "split") return <div className="pv-split"><i /></div>;
  return <div className="pv-live"><span className="live-dot" /> LIVE</div>;
}
export function GameTile({ g }: { g: G }) {
  return <Link className="card gametile spot reveal-s" to={`/arena/${g.id}`} data-tilt><div className="art" style={{ ["--gg" as string]: g.gg }}><Preview pv={g.pv} /></div><h3>{g.title}</h3><p className="muted small">{g.blurb}</p><div className="meta">{g.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div><span className="play" aria-hidden="true">▶</span></Link>;
}
