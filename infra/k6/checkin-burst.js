// k6 load test — the real peak: a 500-member hall checking in within ~60 seconds of the code going up.
//   k6 run -e BASE=https://sambhav.example.edu -e ADMIN_USER=udbhav -e ADMIN_PASS=… infra/k6/checkin-burst.js
// Run against STAGING (it registers N throwaway members — the per-IP signup ceiling is 600 / 15 min).
// Setup creates N throwaway members and one OPEN session; each VU then checks in once with the live code.
// SLOs: p95 < 400 ms, error rate < 1 %, every member marked exactly once.
import http from "k6/http";
import { check, fail } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:4000";
const N = Number(__ENV.MEMBERS || 500);
const marked = new Counter("checkins_marked");

export const options = {
  setupTimeout: "5m",
  scenarios: {
    burst: { executor: "per-vu-iterations", vus: N, iterations: 1, maxDuration: "40s" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:checkin}": ["p(95)<400"],
    checkins_marked: [`count>=${Math.floor(N * 0.99)}`],
  },
};


export function setup() {
  const a = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ identifier: __ENV.ADMIN_USER || "udbhav", password: __ENV.ADMIN_PASS || "1234" }), { headers: { "Content-Type": "application/json" } });
  if (a.status !== 200) fail(`admin login failed: ${a.status}`);
  const admin = a.json("accessToken");
  const auth = { headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` } };
  const s = http.post(`${BASE}/api/v1/attendance/sessions`, JSON.stringify({ title: `k6 burst ${Date.now()}`, date: new Date().toISOString().slice(0, 10) }), auth);
  if (s.status !== 201) fail(`session create failed: ${s.status} ${s.body}`);
  const sessionId = s.json("session.id");
  http.post(`${BASE}/api/v1/attendance/sessions/${sessionId}/open`, null, auth);

  const tokens = [];
  const run = Date.now();
  for (let i = 0; i < N; i++) {
    const r = http.post(`${BASE}/api/v1/auth/register`, JSON.stringify({ email: `k6-${run}-${i}@load.test`, password: "Passw0rd!", name: `Load ${i}` }), { headers: { "Content-Type": "application/json" } });
    if (r.status === 201) tokens.push(r.json("accessToken"));
  }
  // Read the live code once, right before the burst (TOTP accepts ±1 step, so it stays valid ~30–60 s).
  const code = http.get(`${BASE}/api/v1/attendance/sessions/${sessionId}/code`, auth).json("code");
  return { admin, sessionId, tokens, code };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const code = data.code;
  const r = http.post(`${BASE}/api/v1/attendance/check-in`, JSON.stringify({ sessionId: data.sessionId, code }), { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, tags: { name: "checkin" } });
  if (check(r, { "checked in": (x) => x.status === 200 || x.status === 201 })) marked.add(1);
}

export function teardown(data) {
  http.post(`${BASE}/api/v1/attendance/sessions/${data.sessionId}/close`, null, { headers: { Authorization: `Bearer ${data.admin}` } });
}
