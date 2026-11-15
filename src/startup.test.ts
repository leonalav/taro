// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships an accessible loading surface before JavaScript runs", () => {
  const html = readFileSync("index.html", "utf8");
  const document = new DOMParser().parseFromString(html, "text/html");
  const splash = document.querySelector("#taro-startup");
  expect(splash?.querySelector("[role=status]")?.textContent ?? "").toContain("Starting Taro");
  expect(document.querySelector("#root")?.contains(splash)).toBe(false);
  expect(document.querySelector("#root")?.hasAttribute("inert")).toBe(true);
  expect(document.querySelector('link[href="/src/startup.css"]')).toBeTruthy();
});
