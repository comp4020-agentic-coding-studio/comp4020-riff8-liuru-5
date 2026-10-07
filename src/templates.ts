import type { Kind, Trace } from "./db.ts";
import { characterCount, MAX_TRACE_LENGTH } from "./validation.ts";

const KIND_META: Record<Kind, { glyph: string; hanzi: string; label: string }> = {
  dream: { glyph: "☁", hanzi: "夢", label: "a dream" },
  illusion: { glyph: "◈", hanzi: "幻", label: "an illusion" },
  bubble: { glyph: "○", hanzi: "泡", label: "a bubble" },
  shadow: { glyph: "◐", hanzi: "影", label: "a shadow" },
  dew: { glyph: "•", hanzi: "露", label: "dew" },
  lightning: { glyph: "⚡", hanzi: "電", label: "a flash of lightning" },
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeTime(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const shell = (title: string, body: string): string => `<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light dark;
        --paper: #f5f2e9;
        --ink: #303c38;
        --muted: #65736b;
        --line: #53695a29;
        --surface: #fffef7c9;
        --field: #fffefa;
        --accent: #42695b;
        --mine: #e7eee3cc;
        --haze-green: #b6cbbd52;
        --haze-violet: #c7c0d345;
      }
      * { box-sizing: border-box; }
      html { min-height: 100%; background: var(--paper); }
      body {
        font-family: ui-serif, Georgia, "Noto Serif CJK SC", serif;
        max-width: 44rem;
        margin: 0 auto;
        padding: 3.5rem 1.5rem 5rem;
        line-height: 1.65;
        color: var(--ink);
        isolation: isolate;
      }
      .atmosphere { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
      .atmosphere::before {
        content: "";
        position: absolute;
        inset: -12%;
        background: radial-gradient(ellipse at 18% 18%, var(--haze-green), transparent 48%),
          radial-gradient(ellipse at 86% 58%, var(--haze-violet), transparent 45%);
        animation: mist-drift 24s ease-in-out infinite alternate;
      }
      .atmosphere::after {
        content: "";
        position: absolute;
        inset: 0;
        opacity: 0.17;
        background-image: radial-gradient(var(--muted) 0.45px, transparent 0.45px);
        background-size: 5px 5px;
      }
      .ripple { position: absolute; width: 19rem; height: 19rem; border: 1px solid var(--line); border-radius: 50%; opacity: 0.35; }
      .ripple:first-child { top: 5%; left: calc(50% - 41rem); }
      .ripple:last-child { right: calc(50% - 43rem); bottom: 8%; width: 27rem; height: 27rem; }
      header { margin-bottom: 2rem; animation: arrive 650ms ease-out both; }
      h1 { margin: 0 0 1rem; font-size: 1.4rem; font-weight: normal; line-height: 1.4; }
      .title-hanzi { display: block; font-size: 3.8rem; letter-spacing: 0.16em; line-height: 1.2; margin-bottom: 0.65rem; }
      .title-text { font-size: 1.15rem; letter-spacing: 0.035em; }
      .sub { color: var(--muted); max-width: 34rem; margin: 0 0 1rem; font-size: 0.95rem; }
      .similes { display: flex; gap: 1.4rem; margin: 1.5rem 0 1.25rem; color: var(--accent); font-size: 1.05rem; }
      .similes span { position: relative; }
      .similes span + span::before { content: "·"; position: absolute; left: -0.85rem; opacity: 0.4; }
      nav.meta { font-size: 0.8rem; }
      nav.meta a { color: var(--muted); text-underline-offset: 0.25em; text-decoration-color: var(--line); transition: color 180ms, text-decoration-color 180ms; }
      nav.meta a:hover { color: var(--accent); text-decoration-color: currentColor; }
      form.trace-form {
        display: grid;
        gap: 1rem;
        border: 1px solid var(--line);
        border-radius: 1rem;
        padding: 1.5rem;
        margin-bottom: 2.5rem;
        background: var(--surface);
        box-shadow: 0 12px 40px #263a2c05;
        animation: arrive 650ms 80ms ease-out both;
      }
      form.trace-form label { display: grid; gap: 0.4rem; font-size: 0.85rem; color: var(--muted); }
      form.trace-form select,
      form.trace-form textarea {
        font: inherit;
        font-size: 1rem;
        width: 100%;
        min-width: 0;
        padding: 0.65rem 0.8rem;
        border-radius: 0.45rem;
        border: 1px solid var(--line);
        color: var(--ink);
        background: var(--field);
        transition: border-color 180ms, box-shadow 180ms;
      }
      form.trace-form textarea { resize: vertical; min-height: 7rem; line-height: 1.6; }
      form.trace-form textarea::placeholder { color: var(--muted); opacity: 1; }
      form.trace-form :is(textarea, select):focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--haze-green); outline: none; }
      .input-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; }
      .input-hint, .privacy-note, .trace-counter { color: var(--muted); font-size: 0.75rem; margin: 0; }
      .trace-counter { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .form-message { margin: 0; padding: 0.7rem 0.85rem; border: 1px solid var(--line); border-radius: 0.45rem; font-size: 0.9rem; overflow-wrap: anywhere; }
      .form-error, .trace-counter.over-limit { color: light-dark(#96392e, #ffc0b6); }
      .form-error { border-color: currentColor; }
      .form-success { background: var(--mine); color: var(--ink); }
      [aria-invalid="true"] { border-color: light-dark(#96392e, #ffc0b6) !important; }
      form.trace-form button {
        font: inherit;
        justify-self: start;
        padding: 0.55rem 1.25rem;
        border-radius: 999px;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: var(--field);
        cursor: pointer;
        transition: transform 180ms, box-shadow 180ms, opacity 180ms;
      }
      form.trace-form button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px var(--haze-green); }
      form.trace-form button:active { transform: translateY(0); }
      :focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
      .wall-heading { display: flex; align-items: center; gap: 1rem; margin: 0 0 1rem; color: var(--muted); font-size: 0.8rem; font-weight: normal; letter-spacing: 0.06em; }
      .wall-heading::after { content: ""; flex: 1; height: 1px; background: var(--line); }
      ul.wall { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; animation: arrive 650ms 160ms ease-out both; }
      li.trace {
        display: grid;
        grid-template-columns: 1.6rem minmax(0, 1fr) auto;
        gap: 0.75rem;
        align-items: baseline;
        padding: 0.85rem 0.75rem;
        border-radius: 0.6rem;
        border: 1px solid transparent;
        transition: background 180ms, border-color 180ms;
      }
      li.trace:hover { background: var(--surface); border-color: var(--line); }
      li.trace.mine { background: var(--mine); }
      li.trace .glyph { font-size: 1.1rem; text-align: center; color: var(--accent); }
      li.trace .text { overflow-wrap: anywhere; min-width: 0; white-space: pre-wrap; }
      li.trace .when { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
      .empty { padding: 2rem 1rem; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 0.75rem; font-size: 0.95rem; }
      .empty::before { content: "○"; display: block; margin-bottom: 0.5rem; color: var(--accent); font-size: 1.6rem; }
      pre.readme-body { white-space: pre-wrap; }
      @keyframes arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes mist-drift { from { transform: translate3d(-1%, -1%, 0); } to { transform: translate3d(2%, 2%, 0); } }
      @media (prefers-color-scheme: dark) {
        :root {
          --paper: #1d2522;
          --ink: #e0e6dc;
          --muted: #a7b4ab;
          --line: #b0c4b52b;
          --surface: #27332cdc;
          --field: #202b25;
          --accent: #accab6;
          --mine: #344538cc;
          --haze-green: #54715d30;
          --haze-violet: #79708a25;
        }
      }
      @media (max-width: 480px) {
        body { padding: 2rem 1rem 3rem; }
        .title-hanzi { font-size: 3.2rem; }
        form.trace-form { padding: 1rem; }
        li.trace { grid-template-columns: 1.4rem minmax(0, 1fr); gap: 0.2rem 0.6rem; }
        li.trace .when { grid-column: 2; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation: none !important; transition: none !important; }
        form.trace-form button:hover { transform: none; }
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    </style>
  </head>
  <body>
    <div class="atmosphere" aria-hidden="true"><span class="ripple"></span><span class="ripple"></span></div>
    ${body}
  </body>
</html>`;

export interface WallFeedback {
  text?: string;
  kind?: string;
  error?: string;
  errorField?: "kind" | "text";
  posted?: boolean;
}

export function renderWall(traces: Trace[], visitorId: string, feedback: WallFeedback = {}): string {
  const draft = feedback.text ?? "";
  const chosenKind = feedback.kind ?? "dream";
  const options = Object.entries(KIND_META)
    .map(([value, m]) => `<option value="${value}"${value === chosenKind ? " selected" : ""}>${m.hanzi} ${escapeHtml(m.label)}</option>`)
    .join("");
  const invalidKind = !Object.hasOwn(KIND_META, chosenKind);
  const message = feedback.error
    ? `<p class="form-message form-error" id="form-error" role="alert">${escapeHtml(feedback.error)}</p>`
    : feedback.posted
      ? `<p class="form-message form-success" role="status">Your thought has found a place here.</p>`
      : "";

  const items = traces.length
    ? traces
        .map((t) => {
          const meta = KIND_META[t.kind];
          const isMine = t.visitorId === visitorId;
          const mineLabel = isMine ? `<span class="visually-hidden">yours: </span>` : "";
          return `<li class="trace kind-${t.kind}${isMine ? " mine" : ""}">
            <span class="glyph" aria-hidden="true" title="${meta.hanzi} ${escapeHtml(meta.label)}">${meta.glyph}</span>
            <span class="visually-hidden">tagged as ${escapeHtml(meta.label)}: </span>
            <span class="text">${mineLabel}${escapeHtml(t.text)}</span>
            <span class="when">${relativeTime(t.createdAt)}</span>
          </li>`;
        })
        .join("\n")
    : `<li class="empty">nothing has passed through yet</li>`;

  const body = `
    <header>
      <h1><span class="title-hanzi" lang="zh-Hant">六如</span><span class="title-text">a wall for passing things</span></h1>
      <p class="sub">leave a thought as one of the six as-ifs; it stays here, quietly, whether or not you come back</p>
      <div class="similes" aria-hidden="true"><span>夢</span><span>幻</span><span>泡</span><span>影</span><span>露</span><span>電</span></div>
      <nav class="meta"><a href="/readme/">what this is for</a></nav>
    </header>
    <main>
      <form class="trace-form" method="post" action="/trace">
        ${message}
        <label>this feels like&hellip;
          <select name="kind" required${feedback.errorField === "kind" ? ' aria-invalid="true" aria-describedby="form-error"' : ""}>${invalidKind ? '<option value="" disabled selected>choose one of the six</option>' : ""}${options}</select>
        </label>
        <label>what passed through
          <textarea id="trace-text" name="text" rows="3" required aria-describedby="trace-hint trace-counter${feedback.errorField === "text" ? " form-error" : ""}"${feedback.errorField === "text" ? ' aria-invalid="true"' : ""} placeholder="a fragment, not an essay">
${escapeHtml(draft)}</textarea>
        </label>
        <div class="input-meta">
          <p class="input-hint" id="trace-hint">Up to ${MAX_TRACE_LENGTH} characters. Emoji count as whole characters.</p>
          <span class="trace-counter" id="trace-counter" aria-live="polite" aria-atomic="true">${characterCount(draft.trim())} / ${MAX_TRACE_LENGTH}</span>
        </div>
        <button type="submit">let it go</button>
        <p class="privacy-note">Thoughts stay here and cannot be edited or removed. This browser remembers which ones are yours.</p>
      </form>
      <h2 class="wall-heading" id="wall-heading">passing through</h2>
      <ul class="wall" aria-labelledby="wall-heading">
        ${items}
      </ul>
    </main>
    <script>
      (() => {
        // Older browsers still use the server's validation and ordinary form POST.
        if (typeof Intl.Segmenter !== "function") return;
        const form = document.querySelector(".trace-form");
        const input = document.getElementById("trace-text");
        const counter = document.getElementById("trace-counter");
        const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
        let composing = false;
        function update() {
          const length = Array.from(segmenter.segment(input.value.trim())).length;
          const over = length > ${MAX_TRACE_LENGTH};
          counter.textContent = length + " / ${MAX_TRACE_LENGTH}";
          counter.classList.toggle("over-limit", over);
          const message = over
            ? "Please keep your thought to ${MAX_TRACE_LENGTH} characters. Your draft is still here."
            : length === 0 ? "Please leave a thought before letting it go." : "";
          input.setCustomValidity(message);
          if (over) input.setAttribute("aria-invalid", "true");
          else input.removeAttribute("aria-invalid");
        }
        input.addEventListener("compositionstart", () => {
          composing = true;
          input.setCustomValidity("");
        });
        input.addEventListener("compositionend", () => { composing = false; update(); });
        input.addEventListener("input", () => { if (!composing) update(); });
        form.addEventListener("submit", (event) => {
          if (composing) { event.preventDefault(); return; }
          update();
          if (!form.checkValidity()) { event.preventDefault(); form.reportValidity(); }
        });
        // Keep the server's error semantics until the draft is actually edited.
        if (!document.getElementById("form-error")) update();
      })();
    </script>
  `;
  return shell("六如 — a wall for passing things", body);
}

export function renderReadme(bodyHtml: string): string {
  const body = `
    <nav class="meta"><a href="/">back to the wall</a></nav>
    <main>${bodyHtml}</main>
  `;
  return shell("About — 六如", body);
}
