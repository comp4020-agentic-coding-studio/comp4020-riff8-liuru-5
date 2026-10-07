import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// The wall's own promises, on top of the two course-wide checks in
// invariants.test.ts: a posted trace with a real kind and real text shows up,
// and invalid submissions explain the problem without losing the visitor's draft.
// Run against a throwaway DATA_DIR: valid submissions intentionally persist.
const baseUrl = inject("baseUrl");

function randomText(): string {
  return `spec-trace-${Math.random().toString(36).slice(2)}`;
}

function postTrace(text: string, kind = "dew"): Promise<Response> {
  return fetch(new URL("/trace", baseUrl), {
    method: "POST",
    body: new URLSearchParams({ kind, text }),
    redirect: "manual",
  });
}

async function wallTexts(): Promise<string[]> {
  const page = await (await fetch(new URL("/", baseUrl))).text();
  const dom = new JSDOM(page);
  try {
    return [...dom.window.document.querySelectorAll(".wall .text")].map(
      (element) => element.textContent ?? "",
    );
  } finally {
    dom.window.close();
  }
}

it("a posted trace appears on the wall afterwards", async () => {
  const text = randomText();
  const res = await postTrace(text);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/?posted=1");

  expect(await wallTexts()).toContain(text);
});

it("rejects an unrecognised kind and keeps the draft", async () => {
  const text = randomText();
  const res = await postTrace(text, "not-a-real-kind");
  expect(res.status).toBe(422);

  const dom = new JSDOM(await res.text());
  try {
    expect(dom.window.document.querySelector<HTMLTextAreaElement>("textarea[name=text]")?.value).toBe(text);
  } finally {
    dom.window.close();
  }
  expect(await wallTexts()).not.toContain(text);
});

it.each(["", "   ", " \n\t "])("rejects blank text %j", async (text) => {
  const res = await postTrace(text);
  expect(res.status).toBe(422);
  expect((await wallTexts()).every((storedText) => storedText.trim().length > 0)).toBe(true);
});

it("rejects more than 240 characters instead of silently storing a truncated trace", async () => {
  const marker = randomText();
  const over = marker + "x".repeat(241 - marker.length);
  const res = await postTrace(over);
  expect(res.status).toBe(422);

  const dom = new JSDOM(await res.text());
  try {
    expect(dom.window.document.querySelector<HTMLTextAreaElement>("textarea[name=text]")?.value).toBe(over);
  } finally {
    dom.window.close();
  }
  expect((await wallTexts()).some((text) => text.includes(marker))).toBe(false);
});

it.each([
  ["emoji", "🌙"],
  ["family ZWJ emoji", "👨‍👩‍👧‍👦"],
  ["combining sequence", "e\u0301"],
])("accepts a %s as the 240th character intact", async (_description, lastCharacter) => {
  const text = randomText().padEnd(239, "a") + lastCharacter;
  const res = await postTrace(text);
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe("/?posted=1");
  expect(await wallTexts()).toContain(text);
});

it("validates and stores trimmed text while preserving internal newlines", async () => {
  const text = `${randomText()}\na second line`.padEnd(240, "a");
  const res = await postTrace(`  \n${text}\n  `);
  expect(res.status).toBe(303);
  expect(await wallTexts()).toContain(text);
});

it.each(["  ", "\n"])("retains the raw escaped draft, including its %j prefix, after validation fails", async (prefix) => {
  const marker = randomText();
  const raw = `${prefix}${marker}</textarea><p id="draft-injection">& \"quoted\" 'text'</p>\n${"x".repeat(241)}  `;
  const res = await postTrace(raw);
  expect(res.status).toBe(422);

  const dom = new JSDOM(await res.text());
  try {
    const document = dom.window.document;
    expect(document.querySelector<HTMLTextAreaElement>("textarea[name=text]")?.value).toBe(raw);
    expect(document.querySelector("#draft-injection")).toBeNull();
  } finally {
    dom.window.close();
  }
  expect((await wallTexts()).some((text) => text.includes(marker))).toBe(false);
});
