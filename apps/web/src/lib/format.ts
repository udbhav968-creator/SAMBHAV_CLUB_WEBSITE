export const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (n: number, d = 0) => `${fmt(n * 100, d)}%`;
export const fdate = (iso: string | Date) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const ftime = (iso: string | Date) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const frac = (x: number) => { for (let d = 1; d <= 24; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-6) return d === 1 ? String(n) : `${n}/${d}`; } return x.toFixed(3); };
