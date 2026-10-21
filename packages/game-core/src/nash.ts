/** Bimatrix games up to 3×3: best responses, dominance, pure and mixed Nash equilibria (support enumeration). */
export type Matrix = number[][];
export interface Equilibrium { p: number[]; q: number[]; u: number; v: number; pure: boolean }
export interface Solution { equilibria: Equilibrium[]; rowBestResponse: boolean[][]; colBestResponse: boolean[][]; dominatedRows: [number, number][]; dominatedCols: [number, number][] }
const EPS = 1e-9;

export function solveLinear(M: number[][], b: number[]): number[] | null {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}

function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (s: number, acc: number[]) => { if (acc.length === k) { out.push([...acc]); return; } for (let i = s; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); } };
  rec(0, []); return out;
}

export function solve(A: Matrix, B: Matrix): Solution {
  const m = A.length, n = A[0]?.length ?? 0;
  if (m < 1 || n < 1 || m > 3 || n > 3 || B.length !== m || B.some((r) => r.length !== n) || A.some((r) => r.length !== n)) throw new RangeError("Matrices must be the same shape, up to 3×3");
  // rowBestResponse[j][i]: row i is a best response to column j
  const rowBestResponse = Array.from({ length: n }, (_, j) => { const mx = Math.max(...A.map((r) => r[j])); return A.map((r) => Math.abs(r[j] - mx) < EPS); });
  const colBestResponse = A.map((_, i) => { const mx = Math.max(...B[i]); return B[i].map((v) => Math.abs(v - mx) < EPS); });
  const equilibria: Equilibrium[] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (rowBestResponse[j][i] && colBestResponse[i][j]) {
    const p = Array(m).fill(0), q = Array(n).fill(0); p[i] = 1; q[j] = 1; equilibria.push({ p, q, u: A[i][j], v: B[i][j], pure: true });
  }
  for (let k = 2; k <= Math.min(m, n); k++) for (const I of subsets(m, k)) for (const J of subsets(n, k)) {
    const Mq = I.map((i) => [...J.map((j) => A[i][j]), -1]); Mq.push([...J.map(() => 1), 0]);
    const sq = solveLinear(Mq, [...I.map(() => 0), 1]); if (!sq) continue;
    const Mp = J.map((j) => [...I.map((i) => B[i][j]), -1]); Mp.push([...I.map(() => 1), 0]);
    const sp = solveLinear(Mp, [...J.map(() => 0), 1]); if (!sp) continue;
    const qv = sq.slice(0, k), u = sq[k], pv = sp.slice(0, k), v = sp[k];
    if (qv.some((x) => x < -EPS) || pv.some((x) => x < -EPS)) continue;
    const q = Array(n).fill(0), p = Array(m).fill(0);
    J.forEach((j, t) => (q[j] = Math.max(0, qv[t]))); I.forEach((i, t) => (p[i] = Math.max(0, pv[t])));
    let ok = true;
    for (let i = 0; i < m; i++) if (q.reduce((s, qq, j) => s + qq * A[i][j], 0) > u + 1e-7) ok = false;
    for (let j = 0; j < n; j++) if (p.reduce((s, pp, i) => s + pp * B[i][j], 0) > v + 1e-7) ok = false;
    if (!ok || p.filter((x) => x > EPS).length < 2 || q.filter((x) => x > EPS).length < 2) continue;
    if (!equilibria.some((e) => e.p.every((x, i) => Math.abs(x - p[i]) < 1e-6) && e.q.every((x, j) => Math.abs(x - q[j]) < 1e-6)))
      equilibria.push({ p, q, u, v, pure: false });
  }
  const dominatedRows: [number, number][] = [], dominatedCols: [number, number][] = [];
  for (let i = 0; i < m; i++) for (let k = 0; k < m; k++) if (i !== k && A[i].every((x, j) => x < A[k][j])) { dominatedRows.push([i, k]); break; }
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (j !== k && B.every((r) => r[j] < r[k])) { dominatedCols.push([j, k]); break; }
  return { equilibria, rowBestResponse, colBestResponse, dominatedRows, dominatedCols };
}
