import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function PageHead({ crumb, title, lede, actions }: { crumb: string; title: string; lede?: ReactNode; actions?: ReactNode }) {
  return <section className="pagehead"><div className="wrap">
    <div className="crumbs enter"><Link to="/">Sambhav</Link> / {crumb}</div>
    <div className="spread"><h1 className="enter d1">{title}</h1><div className="row enter d2">{actions}</div></div>
    {lede && <p className="lede enter d2">{lede}</p>}
  </div></section>;
}
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><b>{title}</b>{children}</div>;
export const Pill = ({ tone = "", children }: { tone?: string; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>;
export const Bar = ({ value, tone = "" }: { value: number; tone?: string }) => <div className={`bar ${tone}`}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
export const Avatar = ({ name }: { name: string }) => {
  const colors = ["#14549a", "#1f7a4d", "#b8322a", "#7a3fa0", "#a86a00", "#0f6e80"]; let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return <span className="av" style={{ background: colors[Math.abs(h) % colors.length] }}>{name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>;
};
export const Loading = () => <div className="stack"><div className="skeleton" style={{ width: "60%" }} /><div className="skeleton" style={{ width: "80%" }} /><div className="skeleton" style={{ width: "40%" }} /></div>;

const ToastCtx = createContext<(m: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => { setMsg(m); window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3200); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><h3>{title}</h3>{children}</div></div>;
}

export function LineChart({ series, height = 200 }: { series: { pts: [number, number][]; color: string; label?: string; dash?: string }[]; height?: number }) {
  const all = series.flatMap((s) => s.pts); if (!all.length) return <Empty title="No data yet" />;
  const w = 560, h = height, pad = { l: 44, r: 12, t: 12, b: 24 };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs); let x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x0 === x1) x1 = x0 + 1;
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const X = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (w - pad.l - pad.r), Y = (y: number) => h - pad.b - ((y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  return <>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {[0, 1, 2, 3, 4].map((i) => { const v = y0 + ((y1 - y0) * i) / 4; return <g key={i}><line className="grid" x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} /><text x={pad.l - 6} y={Y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>; })}
      {series.map((s, k) => <path key={k} d={s.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join("")} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />)}
    </svg>
    <div className="row" style={{ gap: 14 }}>{series.filter((s) => s.label).map((s) => <span key={s.label} className="row small" style={{ gap: 6 }}><i style={{ width: 14, height: 3, background: s.color, display: "inline-block" }} />{s.label}</span>)}</div>
  </>;
}
