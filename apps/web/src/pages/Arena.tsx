import { useRef } from "react";
import { GameTile } from "../components/GameArt";
import { useFx } from "../lib/fx";
import { GAMES } from "./catalog";
export default function Arena() {
  const ref = useRef<HTMLDivElement>(null); useFx(ref);
  return <div ref={ref}><section className="arena-head"><div className="wrap" style={{ paddingBlock: "56px 44px", display: "grid", gap: 14 }}><span className="chip-live enter"><b>FAIR</b> Virtual credits only · outcomes you can verify</span><h1 className="enter d1">The <span className="grad-text">Arena.</span></h1><p className="lede enter d2">Every outcome is computed on the server — points can't be forged from the browser.</p></div></section>
    <section className="band"><div className="wrap grid g3">{GAMES.map((g) => <GameTile key={g.id} g={g} />)}</div></section></div>;
}
