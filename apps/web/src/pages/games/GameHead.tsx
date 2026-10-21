import { Link } from "react-router-dom";
import { GAMES } from "../catalog";
export default function GameHead({ id }: { id: (typeof GAMES)[number]["id"] }) {
  const g = GAMES.find((x) => x.id === id)!; const hex = g.gg.match(/#[0-9a-f]{6}/gi) ?? ["#8b6cff", "#ff4f8b"];
  return <section className="arena-head" style={{ ["--g1" as string]: `${hex[0]}66`, ["--g2" as string]: `${hex[hex.length - 1]}44` }}><div className="wrap" style={{ paddingBlock: "40px 30px", display: "grid", gap: 10 }}>
    <div className="crumbs"><Link to="/arena">Arena</Link> / {g.title}</div><div className="eyebrow">{g.tags.join(" · ")}</div>
    <h1 className="enter" style={{ fontSize: "clamp(2rem,4.6vw,3.6rem)" }}>{g.title}</h1><p className="lede enter d1">{g.blurb}</p></div></section>;
}
