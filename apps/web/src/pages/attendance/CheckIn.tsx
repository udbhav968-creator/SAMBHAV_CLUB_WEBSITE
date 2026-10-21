import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";

/** QR deep link: /check-in?s=<session>&c=<code>. Still requires sign-in and a code from the live window. */
export default function CheckIn() {
  const [sp] = useSearchParams(); const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null); const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return; ran.current = true;
    api<{ already: boolean }>("/attendance/check-in", { body: { sessionId: sp.get("s"), code: sp.get("c"), via: "QR" } })
      .then((r) => setState({ ok: true, msg: r.already ? "You were already marked present." : "You're checked in. Welcome!" }))
      .catch((e) => setState({ ok: false, msg: e instanceof ApiError ? e.message : "Check-in failed" }));
  }, [sp]);
  return <div className="wrap"><div className="card pad-lg auth-card" style={{ textAlign: "center" }}><h2>Check-in</h2>
    {!state ? <p className="muted" style={{ marginTop: 10 }}>Verifying…</p> : <div className={`banner ${state.ok ? "good" : "warn"}`} style={{ marginTop: 14 }}>{state.msg}</div>}
    <p style={{ marginTop: 14 }}><Link to="/attendance">Go to attendance</Link></p></div></div>;
}
