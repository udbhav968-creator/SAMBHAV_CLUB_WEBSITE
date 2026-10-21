/** Motion layer: particle field, kinetic text, counters, magnetic/tilt/spotlight, confetti. All honour reduced-motion. */
import { useEffect, type RefObject } from "react";

export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => matchMedia("(pointer: fine)").matches;
const COLS = ["#8b6cff", "#22d3ee", "#2fe39e", "#ffb224", "#ff4f8b"];

export function startParticleField(cv: HTMLCanvasElement): () => void {
  const ctx = cv.getContext("2d")!; const dpr = Math.min(2, devicePixelRatio || 1); let W = 0, H = 0, raf = 0, visible = true;
  const mouse = { x: -1e4, y: -1e4 }; let pts: { x: number; y: number; vx: number; vy: number; r: number; c: string }[] = [];
  const size = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, Math.max(36, (W * H) / 16000)));
    pts = Array.from({ length: n }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 1.2 + Math.random() * 2.2, c: COLS[i % COLS.length] })); };
  const frame = () => {
    ctx.clearRect(0, 0, W, H); const light = document.documentElement.dataset.theme === "light" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: light)").matches);
    if (!reduceMotion()) for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; const dx = mouse.x - p.x, dy = mouse.y - p.y; if (dx * dx + dy * dy < 25600) { p.x -= dx * 0.004; p.y -= dy * 0.004; } }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d >= 130) continue;
      const near = Math.hypot(mouse.x - (a.x + b.x) / 2, mouse.y - (a.y + b.y) / 2) < 180;
      ctx.strokeStyle = near ? a.c : light ? `rgba(70,70,160,${0.16 * (1 - d / 130)})` : `rgba(170,180,255,${0.22 * (1 - d / 130)})`;
      ctx.globalAlpha = near ? 0.8 * (1 - d / 130) : 1; ctx.lineWidth = near ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; }
    if (visible && !reduceMotion()) raf = requestAnimationFrame(frame);
  };
  const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  const leave = () => { mouse.x = mouse.y = -1e4; };
  const io = new IntersectionObserver(([en]) => { const was = visible; visible = en.isIntersecting; if (visible && !was) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
  size(); frame(); io.observe(cv); addEventListener("resize", size); cv.parentElement?.addEventListener("pointermove", move); cv.parentElement?.addEventListener("pointerleave", leave);
  return () => { cancelAnimationFrame(raf); io.disconnect(); removeEventListener("resize", size); cv.parentElement?.removeEventListener("pointermove", move); cv.parentElement?.removeEventListener("pointerleave", leave); };
}

/** Binds rotators, counters, magnetic buttons, 3D tilt and spotlight inside a container. */
export function useFx(ref: RefObject<HTMLElement>, deps: unknown[] = []) {
  useEffect(() => {
    const root = ref.current; if (!root) return; const off: (() => void)[] = [];
    root.querySelectorAll<HTMLCanvasElement>("canvas.field").forEach((c) => off.push(startParticleField(c)));
    root.querySelectorAll<HTMLElement>(".rotator").forEach((el) => {
      const items = [...el.children] as HTMLElement[]; let i = 0; if (items.length < 2) return;
      const t = window.setInterval(() => { if (reduceMotion()) return; const cur = items[i]; i = (i + 1) % items.length; const nx = items[i];
        cur.classList.remove("on"); cur.classList.add("out"); nx.classList.remove("out"); nx.classList.add("on"); window.setTimeout(() => cur.classList.remove("out"), 750); }, 2300);
      off.push(() => clearInterval(t));
    });
    if (!reduceMotion()) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (!en.isIntersecting) return; io.unobserve(en.target); const el = en.target as HTMLElement;
        const end = parseFloat(el.dataset.count ?? "0"), suf = el.dataset.suffix ?? "", t0 = performance.now(); if (!end) return;
        const step = (t: number) => { const k = Math.min(1, (t - t0) / 1300); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString("en-IN") + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }), { threshold: 0.4 });
      root.querySelectorAll("[data-count]").forEach((e) => io.observe(e)); off.push(() => io.disconnect());
    }
    if (fine() && !reduceMotion()) {
      root.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((b) => {
        const mv = (e: PointerEvent) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px,${(e.clientY - r.top - r.height / 2) * 0.3}px)`; };
        const lv = () => { b.style.transform = ""; }; b.addEventListener("pointermove", mv); b.addEventListener("pointerleave", lv);
        off.push(() => { b.removeEventListener("pointermove", mv); b.removeEventListener("pointerleave", lv); }); });
      root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((c) => {
        const mv = (e: PointerEvent) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; c.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 9}deg) translateY(-4px)`; };
        const lv = () => { c.style.transform = ""; }; c.addEventListener("pointermove", mv); c.addEventListener("pointerleave", lv);
        off.push(() => { c.removeEventListener("pointermove", mv); c.removeEventListener("pointerleave", lv); }); });
      root.querySelectorAll<HTMLElement>(".spot").forEach((c) => {
        const mv = (e: PointerEvent) => { const r = c.getBoundingClientRect(); c.style.setProperty("--sx", `${e.clientX - r.left}px`); c.style.setProperty("--sy", `${e.clientY - r.top}px`); };
        c.addEventListener("pointermove", mv); off.push(() => c.removeEventListener("pointermove", mv)); });
    }
    return () => off.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Short confetti burst for real achievements. */
export function celebrate(power = 1) {
  if (reduceMotion()) return;
  const cv = document.createElement("canvas"); cv.className = "confetti"; document.body.appendChild(cv);
  const ctx = cv.getContext("2d")!, dpr = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const cols = [...COLS, "#ffffff"];
  const ps = Array.from({ length: Math.round(140 * power) }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const f = (t: number) => { ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    if (t - t0 < 2600) requestAnimationFrame(f); else cv.remove(); };
  requestAnimationFrame(f);
}
