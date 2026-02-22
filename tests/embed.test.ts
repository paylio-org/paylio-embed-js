import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPaylioEmbed } from "../src/index";
import type { PaylioEmbedOptions, PaylioEmbedInstance } from "../src/types";

describe("createPaylioEmbed", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="paylio-plans"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // ── Validation ──────────────────────────────────────────────────

  it("throws if publishableKey is empty", () => {
    expect(() =>
      createPaylioEmbed({ publishableKey: "", userId: "u1" })
    ).toThrow(/publishableKey/i);
  });

  it("throws if publishableKey is whitespace-only", () => {
    expect(() =>
      createPaylioEmbed({ publishableKey: "   ", userId: "u1" })
    ).toThrow(/publishableKey/i);
  });

  it("throws if userId is empty", () => {
    expect(() =>
      createPaylioEmbed({ publishableKey: "pk_test", userId: "" })
    ).toThrow(/userId/i);
  });

  it("throws if container element is not found", () => {
    document.body.innerHTML = ""; // remove default container
    expect(() =>
      createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" })
    ).toThrow(/container/i);
  });

  // ── Iframe creation ─────────────────────────────────────────────

  it("creates an iframe inside the default container", () => {
    createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("#paylio-plans iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.tagName).toBe("IFRAME");
  });

  it("creates an iframe inside a custom container by selector", () => {
    document.body.innerHTML = '<div id="custom-box"></div>';
    createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
      container: "#custom-box",
    });
    const iframe = document.querySelector("#custom-box iframe");
    expect(iframe).toBeTruthy();
  });

  it("creates an iframe inside a custom container by element", () => {
    const el = document.createElement("div");
    el.id = "direct-el";
    document.body.appendChild(el);
    createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
      container: el,
    });
    const iframe = el.querySelector("iframe");
    expect(iframe).toBeTruthy();
  });

  // ── Iframe URL ──────────────────────────────────────────────────

  it("sets iframe src with api_key and frequency=monthly", () => {
    createPaylioEmbed({ publishableKey: "pk_live_abc", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("api_key")).toBe("pk_live_abc");
    expect(url.searchParams.get("frequency")).toBe("monthly");
  });

  it("includes user_id in iframe URL", () => {
    createPaylioEmbed({ publishableKey: "pk_test", userId: "user_42" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("user_id")).toBe("user_42");
  });

  it("includes country in iframe URL when provided", () => {
    createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
      country: "IN",
    });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("country")).toBe("IN");
  });

  it("omits country from iframe URL when not provided", () => {
    createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.has("country")).toBe(false);
  });

  // ── Iframe styling ──────────────────────────────────────────────

  it("sets width=100%, no border, min-height on iframe", () => {
    createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.style.width).toBe("100%");
    // jsdom expands shorthand 'border: none' into borderStyle
    expect(iframe.style.borderStyle).toBe("none");
    expect(iframe.style.minHeight).toBe("500px");
  });

  // ── Destroy ─────────────────────────────────────────────────────

  it("destroy() removes iframe from DOM", () => {
    const instance = createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    expect(document.querySelector("iframe")).toBeTruthy();
    instance.destroy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("destroy() removes message event listener", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const instance = createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    instance.destroy();
    expect(removeSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function)
    );
    removeSpy.mockRestore();
  });

  it("destroy() is idempotent (safe to call twice)", () => {
    const instance = createPaylioEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    instance.destroy();
    expect(() => instance.destroy()).not.toThrow();
  });
});

describe("postMessage handling", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="paylio-plans"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resizes iframe on paylio:resize message", async () => {
    createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;

    window.postMessage({ type: "paylio:resize", height: 800 }, "*");

    // Wait for message event to process
    await new Promise((r) => setTimeout(r, 50));

    expect(iframe.style.height).toBe("800px");
  });
});

describe("VERSION export", () => {
  it("exports VERSION as a semver string", async () => {
    const { VERSION } = await import("../src/index");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
