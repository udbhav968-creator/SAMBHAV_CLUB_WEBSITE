import { PageHead } from "../components/ui";
export default function About() {
  return <><PageHead crumb="About" title="About Sambhav" lede="Sambhav means “possible”. We study the space of possible moves — and how people choose among them." />
    <section className="band"><div className="wrap split"><div className="card pad-lg lesson">
      <h2 style={{ fontSize: "1.35rem" }}>Mission</h2><p>To build a community of students who reason clearly about strategic decisions, using game theory, probability and behavioural science, tested through play, competition and research.</p>
      <h3 style={{ marginTop: 20 }}>Code of conduct</h3><ul><li>All casino-style games use virtual credits only. No real money, ever.</li><li>Attendance codes are personal — don't share them outside the room.</li><li>Share strategies after tournaments; play to learn.</li></ul></div>
      <div className="card pad-lg"><h2 style={{ fontSize: "1.35rem" }}>Roles</h2><div className="tablewrap" style={{ marginTop: 12 }}><table><thead><tr><th>Role</th><th>Can do</th></tr></thead><tbody>
        <tr><td><span className="pill bad">Admin</span></td><td className="wrapcell">Everything, plus roles, deactivation and the audit log.</td></tr>
        <tr><td><span className="pill brand">Coordinator</span></td><td className="wrapcell">Events, notices, attendance sessions, roll call, reports, live Arena rounds.</td></tr>
        <tr><td><span className="pill good">Member</span></td><td className="wrapcell">Register, check in, take quizzes, play and earn points.</td></tr></tbody></table></div></div>
    </div></section></>;
}
