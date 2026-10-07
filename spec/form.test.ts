import { JSDOM } from "jsdom";
import { afterEach, beforeAll, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
const openDoms: JSDOM[] = [];
let wallHtml: string;

beforeAll(async () => {
  const response = await fetch(new URL("/", baseUrl));
  expect(response.status).toBe(200);
  wallHtml = await response.text();
});

afterEach(() => {
  for (const dom of openDoms.splice(0)) dom.window.close();
});

async function loadForm(html = wallHtml) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: baseUrl });
  openDoms.push(dom);
  const { document } = dom.window;
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }
  const input = document.querySelector<HTMLTextAreaElement>("textarea#trace-text[name=text]");
  const counter = document.querySelector("#trace-counter");
  expect(input, "the form needs an accessible multiline draft field").not.toBeNull();
  expect(counter, "the form needs a character counter").not.toBeNull();
  return { dom, input: input!, counter: counter! };
}

function characterCount(counter: Element): number {
  const number = counter.textContent?.match(/\d+/)?.[0];
  expect(number, "the counter should show the current character count").toBeDefined();
  return Number(number);
}

it("provides a labelled textarea without a UTF-16 maxlength limit", async () => {
  const { input } = await loadForm();
  expect(input.labels?.length).toBeGreaterThan(0);
  expect([...input.labels!].some((label) => Boolean(label.textContent?.trim()))).toBe(true);
  expect(input.hasAttribute("maxlength")).toBe(false);
});

it("counts trimmed grapheme clusters when the draft changes", async () => {
  const { dom, input, counter } = await loadForm();
  input.value = "  👨‍👩‍👧‍👦e\u0301🌙  ";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(characterCount(counter)).toBe(3);
  expect(input.validity.customError).toBe(false);
  expect(input.value).toBe("  👨‍👩‍👧‍👦e\u0301🌙  ");
});

it("accepts 240 graphemes, rejects 241, and clears the error after correction", async () => {
  const { dom, input, counter } = await loadForm();
  input.value = "a".repeat(239) + "👨‍👩‍👧‍👦";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(characterCount(counter)).toBe(240);
  expect(input.checkValidity()).toBe(true);

  input.value += "e\u0301";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(characterCount(counter)).toBe(241);
  expect(input.validity.customError).toBe(true);
  expect(input.checkValidity()).toBe(false);

  input.value = "a passing thought";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(input.validity.customError).toBe(false);
  expect(input.checkValidity()).toBe(true);
});

it("treats a whitespace-only draft as empty and clears the error for real text", async () => {
  const { dom, input, counter } = await loadForm();
  input.value = " \n\t ";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(characterCount(counter)).toBe(0);
  expect(input.validity.customError).toBe(true);
  expect(input.checkValidity()).toBe(false);

  input.value = "  露  ";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(characterCount(counter)).toBe(1);
  expect(input.validity.customError).toBe(false);
  expect(input.checkValidity()).toBe(true);
});

it("waits until IME composition ends before marking an in-progress draft invalid", async () => {
  const { dom, input, counter } = await loadForm();
  input.value = "a thought";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(input.validity.customError).toBe(false);

  input.dispatchEvent(new dom.window.CompositionEvent("compositionstart", { bubbles: true }));
  input.value = "夢".repeat(241);
  input.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true, isComposing: true }));
  expect(input.validity.customError).toBe(false);
  expect(input.value).toBe("夢".repeat(241));

  input.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true }));
  expect(characterCount(counter)).toBe(241);
  expect(input.validity.customError).toBe(true);
});

it("keeps the server's accessible validation error until the visitor edits the draft", async () => {
  const response = await fetch(new URL("/trace", baseUrl), {
    method: "POST",
    body: new URLSearchParams({ kind: "dew", text: " \n " }),
    redirect: "manual",
  });
  expect(response.status).toBe(422);
  const { dom, input } = await loadForm(await response.text());
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const descriptionIds = input.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  expect(descriptionIds).toContain("form-error");
  expect(dom.window.document.getElementById("form-error")?.textContent?.trim()).toBeTruthy();

  input.value = "露";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  expect(input.getAttribute("aria-invalid")).not.toBe("true");
  expect(input.checkValidity()).toBe(true);
});

it("shows an accessible success confirmation after the successful POST redirect", async () => {
  const response = await fetch(new URL("/?posted=1", baseUrl));
  expect(response.status).toBe(200);
  const dom = new JSDOM(await response.text());
  const ordinaryPage = new JSDOM(wallHtml);
  openDoms.push(dom, ordinaryPage);
  const ordinaryStatuses = new Set(
    [...ordinaryPage.window.document.querySelectorAll('[role="status"]')].map(
      (element) => element.textContent?.trim(),
    ),
  );
  const successStatuses = [...dom.window.document.querySelectorAll('[role="status"]')].map(
    (element) => element.textContent?.trim(),
  );
  expect(successStatuses.some((message) => Boolean(message) && !ordinaryStatuses.has(message))).toBe(true);
});
