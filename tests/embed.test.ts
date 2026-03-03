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
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

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
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

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

    createPaylioEmbed({
      publishableKey: "pk_test",
      scriptUrl: "https://api.paylio.pro/embed/v1/js",
    });

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
    expect(
      document.querySelector('script[src="https://api-origin.paylio.pro/embed/v1/js"]'),
    ).toBeTruthy();
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

  it("supports HTMLElement containers and auto-assigns container id", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

    const host = document.createElement("div");
    document.body.appendChild(host);

    createPaylioEmbed({
      publishableKey: "pk_test",
      container: host,
    });

    await flushAsync();

    expect(host.id).toMatch(/^paylio-plans-\d+$/);
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        container: host,
      }),
    );
  });

  it("throws for invalid scriptUrl", () => {
    expect(() =>
      createPaylioEmbed({
        publishableKey: "pk_test",
        scriptUrl: "not-a-valid-url",
      }),
    ).toThrow(/Invalid scriptUrl/i);
  });

  it("reuses in-flight runtime script load across instances", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const originalAppend = document.head.appendChild.bind(document.head);
    const appendSpy = vi.spyOn(document.head, "appendChild");

    let capturedScript: HTMLScriptElement | null = null;
    appendSpy.mockImplementation((node) => {
      const appended = originalAppend(node);
      if (node instanceof HTMLScriptElement) {
        capturedScript = node;
      }
      return appended;
    });

    createPaylioEmbed({ publishableKey: "pk_test_1" });
    createPaylioEmbed({ publishableKey: "pk_test_2" });

    expect(
      document.querySelectorAll('script[src="https://api.paylio.pro/embed/v1/js"]').length,
    ).toBe(1);

    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };
    capturedScript?.onload?.(new Event("load"));

    await flushAsync();
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledTimes(2);
  });

  it("initializes from existing script load event when runtime is not yet present", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const existingScript = document.createElement("script");
    existingScript.src = "https://api.paylio.pro/embed/v1/js";
    document.head.appendChild(existingScript);

    createPaylioEmbed({ publishableKey: "pk_test_existing_script" });
    await flushAsync();

    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };
    existingScript.dispatchEvent(new Event("load"));
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledTimes(1);
  });

  it("logs error when script is already loaded but runtime API is unavailable", async () => {
    const existingScript = document.createElement("script");
    existingScript.src = "https://api.paylio.pro/embed/v1/js";
    existingScript.setAttribute("data-paylio-runtime-loaded", "1");
    document.head.appendChild(existingScript);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    createPaylioEmbed({ publishableKey: "pk_test_loaded_without_runtime" });
    await flushAsync();
    await flushAsync();

    expect(consoleError).toHaveBeenCalledWith(
      "[Paylio] Hosted runtime API is unavailable and legacy runtime already exists on page.",
    );
  });

  it("logs initialization error when existing script dispatches error", async () => {
    const existingScript = document.createElement("script");
    existingScript.src = "https://custom.paylio.test/embed/v1/js";
    document.head.appendChild(existingScript);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    createPaylioEmbed({
      publishableKey: "pk_test_custom",
      scriptUrl: "https://custom.paylio.test/embed/v1/js",
    });

    await flushAsync();
    existingScript.dispatchEvent(new Event("error"));
    await flushAsync();

    expect(consoleError).toHaveBeenCalledWith(
      "[Paylio] Failed to initialize hosted runtime:",
      expect.any(Error),
    );
  });

  it("uses actual loaded script origin when runtime already exists on page", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

    const existingScript = document.createElement("script");
    existingScript.src = "https://api-origin.paylio.pro/embed/v1/js";
    document.head.appendChild(existingScript);

    createPaylioEmbed({ publishableKey: "pk_test_existing_runtime" });
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api-origin.paylio.pro",
        scriptSrc: "https://api-origin.paylio.pro/embed/v1/js",
      }),
    );
  });

  it("uses exact script URL when canonical runtime script already exists", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

    const existingScript = document.createElement("script");
    existingScript.src = "https://api.paylio.pro/embed/v1/js";
    document.head.appendChild(existingScript);

    createPaylioEmbed({ publishableKey: "pk_test_existing_runtime_exact" });
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api.paylio.pro",
        scriptSrc: "https://api.paylio.pro/embed/v1/js",
      }),
    );
  });

  it("uses runtime that appears after first lookup when existing script is already present", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    const runtimeObject = { init: runtimeInit };
    const existingScript = document.createElement("script");
    existingScript.src = "https://api.paylio.pro/embed/v1/js";
    document.head.appendChild(existingScript);

    let lookupCount = 0;
    Object.defineProperty(window, "PaylioEmbed", {
      configurable: true,
      get() {
        lookupCount += 1;
        if (lookupCount === 1) {
          return undefined;
        }
        return runtimeObject;
      },
    });

    createPaylioEmbed({ publishableKey: "pk_test_runtime_transition" });
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledTimes(1);
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api.paylio.pro",
        scriptSrc: "https://api.paylio.pro/embed/v1/js",
      }),
    );
  });

  it("does not attempt api-origin fallback for non-default custom scriptUrl", async () => {
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

    createPaylioEmbed({
      publishableKey: "pk_test_custom",
      scriptUrl: "https://custom.paylio.test/embed/v1/js",
    });

    await flushAsync();
    await flushAsync();

    expect(
      document.querySelector('script[src="https://custom.paylio.test/embed/v1/js"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('script[src="https://api-origin.paylio.pro/embed/v1/js"]'),
    ).toBeFalsy();
    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://custom.paylio.test",
        scriptSrc: "https://custom.paylio.test/embed/v1/js",
      }),
    );
  });

  it("falls back to default api base when URL parsing fails during init", async () => {
    const runtimeInit = vi.fn(() => ({ destroy: vi.fn() }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

    const OriginalURL = URL;
    let callCount = 0;
    class MockURL {
      private readonly raw: string;

      constructor(value: string) {
        callCount += 1;
        if (callCount === 2) {
          throw new Error("parse-failed");
        }
        this.raw = value;
      }

      toString(): string {
        return this.raw;
      }

      get origin(): string {
        return "https://unexpected.example";
      }
    }
    vi.stubGlobal("URL", MockURL as unknown as typeof URL);

    createPaylioEmbed({
      publishableKey: "pk_test_url_fallback",
      scriptUrl: "https://api.paylio.pro/embed/v1/js",
    });
    await flushAsync();

    expect(runtimeInit).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://api.paylio.pro",
      }),
    );

    vi.stubGlobal("URL", OriginalURL);
  });

  it("allows idempotent destroy calls", async () => {
    const runtimeDestroy = vi.fn();
    const runtimeInit = vi.fn(() => ({ destroy: runtimeDestroy }));
    (window as unknown as { PaylioEmbed: { init: RuntimeInit } }).PaylioEmbed = {
      init: runtimeInit,
    };

    const instance = createPaylioEmbed({ publishableKey: "pk_test_destroy_idempotent" });
    await flushAsync();

    instance.destroy();
    instance.destroy();

    expect(runtimeDestroy).toHaveBeenCalledTimes(1);
  });
});

describe("VERSION export", () => {
  it("exports VERSION as a semver string", async () => {
    const { VERSION } = await import("../src/index");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
