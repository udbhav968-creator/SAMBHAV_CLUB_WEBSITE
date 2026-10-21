import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { md, streamChat } from "../src/components/Vihaan";
import Palette from "../src/components/Palette";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("md() — chat formatting is XSS-safe", () => {
  it("escapes HTML before applying markdown", () => {
    const out = md('<img src=x onerror="alert(1)"> **bold** <script>alert(2)</script>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
    expect(out).toContain("<b>bold</b>");
  });
  it("cannot be tricked into attributes through markdown", () => {
    const out = md('**" onmouseover="alert(1)**');
    expect(out).toContain("<b>&quot; onmouseover=&quot;alert(1)</b>");
  });
  it("renders lists, italics and code", () => {
    const out = md("Coming up:\n- **Nash Night** — *Friday*\n- `code`");
    expect(out).toBe("<p>Coming up:</p><ul><li><b>Nash Night</b> — <i>Friday</i></li><li><code>code</code></li></ul>");
  });
});

describe("streamChat() — SSE over fetch", () => {
  const sse = (chunks: string[], status = 200) => {
    const body = new ReadableStream<Uint8Array>({ start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close(); } });
    return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
  };
  it("parses frames split across network chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sse(['event: action\ndata: {"navigate":"/arena"}\n\nevent: del', 'ta\ndata: {"text":"Beep"}\n', '\nevent: done\ndata: {"mode":"instant"}\n\n']));
    const got: [string, unknown][] = [];
    await streamChat({ messages: [] }, new AbortController().signal, (e, d) => got.push([e, d]));
    expect(got).toEqual([["action", { navigate: "/arena" }], ["delta", { text: "Beep" }], ["done", { mode: "instant" }]]);
  });
  it("maps a 429 to a friendly message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(streamChat({}, new AbortController().signal, () => {})).rejects.toThrow(/cool my circuits/);
  });
  it("surfaces the server's error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "Some fields are invalid" } }), { status: 400 }));
    await expect(streamChat({}, new AbortController().signal, () => {})).rejects.toThrow("Some fields are invalid");
  });
});

describe("Ctrl K palette", () => {
  it("offers to ask Vihaan when typing a question and hands it over", async () => {
    render(<MemoryRouter><Palette /></MemoryRouter>);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText(/jump to/i);
    fireEvent.change(input, { target: { value: "what is a nash equilibrium" } });
    const ask = screen.getByText(/Ask Vihaan/);
    const heard = new Promise<string>((res) => addEventListener("open-vihaan", (e) => res((e as CustomEvent<string>).detail), { once: true }));
    fireEvent.click(ask);
    expect(await heard).toBe("what is a nash equilibrium");
  });
});
