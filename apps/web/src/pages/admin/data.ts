import { api } from "../../api/client";
export interface SessionRow { id: string; title: string; date: string; status: "SCHEDULED" | "OPEN" | "CLOSED"; present: number }
export interface Rep { sessions: { id: string; title: string; date: string }[]; rows: { id: string; name: string; rollNo: string | null; programme: string | null; year: number | null; marks: boolean[]; present: number; eligible: number; rate: number }[] }
export const fetchSessions = () => api<{ sessions: SessionRow[] }>("/attendance/sessions");
export const fetchReport = () => api<Rep>("/attendance/report");
export async function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export const csvOf = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
