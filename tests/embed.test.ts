import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaylioEmbed } from "../src/index";

type RuntimeInit = ReturnType<typeof vi.fn>;

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createPaylioEmbed", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="paylio-plans"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.querySelectorAll('script[src*="/embed/v1/js"]').forEach((script) => script.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { PaylioEmbed?: unknown }).PaylioEmbed;
  });

  it("throws if publishableKey is empty", () => {
    expect(() => createPaylioEmbed({ publishableKey: "" })).toThrow(/publishableKey/i);
  });

  it("throws if publishableKey is whitespace-only", () => {
    expect(() => createPaylioEmbed({ publishableKey: "   " })).toThrow(/publishableKey/i);
  });

  it("throws if container is not found", () => {
    document.body.innerHTML = "";
    expect(() => createPaylioEmbed({ publishableKey: "pk_test" })).toThrow(/container/i);
  });

  it("initializes hosted runtime with normalized options", async () => {
    const runtimeDestroy = vi.fn();
    const runtimeInit = vi.fn(() => ({ destroy: runtimeDestroy }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = { init: runtimeInit };

    const instance = createPaylioEmbed({
      publishableKey: "pk_live_123",
      userId: "  user_42  ",
      country: "  IN  ",
      container: "#paylio-plans",
    });

    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledTimes(1);
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: "pk_live_123",
        userId: "user_42",
        country: "IN",
        container: expect.any(HTMLElement),
        apiBaseUrl: "https://api.paylio.pro",
        scriptSrc: "https://api.paylio.pro/embed/v1/js",
      }),
    );

    instance.destroy();
    expect(runtimeDestroy).toHaveBeenCalledTimes(1);
  });

  it("omits userId and country when they are blank", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = { init: runtimeInit };

    createPaylioEmbed({ publishableKey: "pk_test", userId: "   ", country: "   " });
    await flushAsync();

    const firstCall = runtimeInit.mock.calls[0]?.[0];
    expect(firstCall).toBeTruthy();
    expect(firstCall).toMatchObject({ publishableKey: "pk_test" });
    expect(firstCall.userId).toBeUndefined();
    expect(firstCall.country).toBeUndefined();
  });

  it("loads hosted runtime script and initializes once script is loaded", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const originalAppend = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, "appendChild");

    appendSpy.mockImplementation((node) => {
      const appended = originalAppend(node);

      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
            init: runtimeInit,
          };
          node.onload?.(new Event("load"));
        }, 0);
      }

      return appended;
    });

    createPaylioEmbed({ publishableKey: "pk_test", scriptUrl: "https://api.paylio.pro/embed/v1/js" });

    await flushAsync();
    await flushAsync();

    const insertedScript = document.querySelector(
      'script[src="https://api.paylio.pro/embed/v1/js"]',
    ) as HTMLScriptElement | null;

    expect(insertedScript).toBeTruthy();
    expect(runtimeInit).toHaveBeenCalledTimes(1);
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api.paylio.pro",
        scriptSrc: "https://api.paylio.pro/embed/v1/js",
      }),
    );
  });

  it("falls back to api-origin runtime when canonical api runtime fails to load", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const originalAppend = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, "appendChild");

    appendSpy.mockImplementation((node) => {
      const appended = originalAppend(node);
      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          if (node.src === "https://api.paylio.pro/embed/v1/js") {
            node.onerror?.(new Event("error"));
            return;
          }

          (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
            init: runtimeInit,
          };
          node.onload?.(new Event("load"));
        }, 0);
      }

      return appended;
    });

    createPaylioEmbed({ publishableKey: "pk_test" });
    await flushAsync();
    await flushAsync();
    await flushAsync();
    await flushAsync();

    expect(document.querySelector('script[src="https://api.paylio.pro/embed/v1/js"]')).toBeTruthy();
    expect(document.querySelector('script[src="https://api-origin.paylio.pro/embed/v1/js"]')).toBeTruthy();
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api-origin.paylio.pro",
        scriptSrc: "https://api-origin.paylio.pro/embed/v1/js",
      }),
    );
  });

  it("falls back to legacy script-tag mode when runtime API is unavailable", async () => {
    const originalAppend = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, "appendChild");

    appendSpy.mockImplementation((node) => {
      const appended = originalAppend(node);

      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          node.onload?.(new Event("load"));
        }, 0);
      }

      return appended;
    });

    const container = document.getElementById("paylio-plans") as HTMLElement;
    const instance = createPaylioEmbed({
      publishableKey: "pk_test_fallback",
      userId: "user_fallback",
      country: "IN",
    });

    await flushAsync();
    await flushAsync();
    await flushAsync();

    const scripts = Array.from(
      document.querySelectorAll('script[src="https://api.paylio.pro/embed/v1/js"]'),
    ) as HTMLScriptElement[];

    expect(scripts.length).toBe(1);

    const legacyScript = scripts[0];
    expect(legacyScript.getAttribute("data-paylio-sdk-runtime")).toBe("1");
    expect(legacyScript.getAttribute("data-paylio-publishable-key")).toBe("pk_test_fallback");
    expect(legacyScript.getAttribute("data-user-id")).toBe("user_fallback");
    expect(legacyScript.getAttribute("data-country")).toBe("IN");
    expect(legacyScript.getAttribute("data-container")).toBe("paylio-plans");

    const fakeIframe = document.createElement("iframe");
    fakeIframe.src = "https://www.paylio.pro/embed/routing/plans?api_key=pk_test_fallback";
    container.appendChild(fakeIframe);
    instance.destroy();

    expect(container.querySelectorAll("iframe").length).toBe(0);
  });

  it("does not initialize runtime if destroyed before runtime script loads", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const originalAppend = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, "appendChild");

    appendSpy.mockImplementation((node) => {
      const appended = originalAppend(node);

      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
            init: runtimeInit,
          };
          node.onload?.(new Event("load"));
        }, 0);
      }

      return appended;
    });

    const instance = createPaylioEmbed({ publishableKey: "pk_test" });
    instance.destroy();

    await flushAsync();
    await flushAsync();

    expect(runtimeInit).not.toHaveBeenCalled();
  });
});

describe("VERSION export", () => {
  it("exports VERSION as a semver string", async () => {
    const { VERSION } = await import("../src/index");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
