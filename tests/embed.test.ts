import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPaylioEmbed } from "../src/index";
import type { PaylioEmbedInstance } from "../src/types";

describe("createPaylioEmbed", () => {
  const instances: PaylioEmbedInstance[] = [];
  const mountEmbed = (options: Parameters<typeof createPaylioEmbed>[0]): PaylioEmbedInstance => {
    const instance = createPaylioEmbed(options);
    instances.push(instance);
    return instance;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="paylio-plans"></div>';
  });

  afterEach(() => {
    while (instances.length) {
      instances.pop()?.destroy();
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    delete (window as unknown as { Stripe?: unknown }).Stripe;
  });

  // ── Validation ──────────────────────────────────────────────────

  it("throws if publishableKey is empty", () => {
    expect(() => createPaylioEmbed({ publishableKey: "", userId: "u1" })).toThrow(
      /publishableKey/i,
    );
  });

  it("throws if publishableKey is whitespace-only", () => {
    expect(() => createPaylioEmbed({ publishableKey: "   ", userId: "u1" })).toThrow(
      /publishableKey/i,
    );
  });

  it("allows missing userId (anonymous mode)", () => {
    expect(() => mountEmbed({ publishableKey: "pk_test" } as any)).not.toThrow();
  });

  it("allows whitespace-only userId (treated as anonymous)", () => {
    expect(() => mountEmbed({ publishableKey: "pk_test", userId: "   " })).not.toThrow();
  });

  it("throws if container element is not found", () => {
    document.body.innerHTML = ""; // remove default container
    expect(() => createPaylioEmbed({ publishableKey: "pk_test", userId: "u1" })).toThrow(
      /container/i,
    );
  });

  // ── Iframe creation ─────────────────────────────────────────────

  it("creates an iframe inside the default container", () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("#paylio-plans iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.tagName).toBe("IFRAME");
  });

  it("creates an iframe inside a custom container by selector", () => {
    document.body.innerHTML = '<div id="custom-box"></div>';
    mountEmbed({
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
    mountEmbed({
      publishableKey: "pk_test",
      userId: "u1",
      container: el,
    });
    const iframe = el.querySelector("iframe");
    expect(iframe).toBeTruthy();
  });

  // ── Iframe URL ──────────────────────────────────────────────────

  it("sets iframe src with api_key and frequency=monthly", () => {
    mountEmbed({ publishableKey: "pk_live_abc", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("api_key")).toBe("pk_live_abc");
    expect(url.searchParams.get("frequency")).toBe("monthly");
  });

  it("includes user_id in iframe URL", () => {
    mountEmbed({ publishableKey: "pk_test", userId: "user_42" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("user_id")).toBe("user_42");
  });

  it("omits user_id in iframe URL when userId is missing", () => {
    mountEmbed({ publishableKey: "pk_test" } as any);
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.has("user_id")).toBe(false);
  });

  it("omits user_id in iframe URL when userId is whitespace-only", () => {
    mountEmbed({ publishableKey: "pk_test", userId: "   " });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.has("user_id")).toBe(false);
  });

  it("includes country in iframe URL when provided", () => {
    mountEmbed({
      publishableKey: "pk_test",
      userId: "u1",
      country: "IN",
    });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.get("country")).toBe("IN");
  });

  it("omits country from iframe URL when not provided", () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    const url = new URL(iframe.src);
    expect(url.searchParams.has("country")).toBe(false);
  });

  // ── Iframe styling ──────────────────────────────────────────────

  it("sets width=100%, no border, min-height on iframe", () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.style.width).toBe("100%");
    // jsdom expands shorthand 'border: none' into borderStyle
    expect(iframe.style.borderStyle).toBe("none");
    expect(iframe.style.minHeight).toBe("500px");
  });

  // ── Destroy ─────────────────────────────────────────────────────

  it("destroy() removes iframe from DOM", () => {
    const instance = mountEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    expect(document.querySelector("iframe")).toBeTruthy();
    instance.destroy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("destroy() removes message event listener", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const instance = mountEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    instance.destroy();
    expect(removeSpy).toHaveBeenCalledWith("message", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("destroy() is idempotent (safe to call twice)", () => {
    const instance = mountEmbed({
      publishableKey: "pk_test",
      userId: "u1",
    });
    instance.destroy();
    expect(() => instance.destroy()).not.toThrow();
  });
});

describe("postMessage handling", () => {
  const instances: PaylioEmbedInstance[] = [];
  const mountEmbed = (options: Parameters<typeof createPaylioEmbed>[0]): PaylioEmbedInstance => {
    const instance = createPaylioEmbed(options);
    instances.push(instance);
    return instance;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="paylio-plans"></div>';
  });

  afterEach(() => {
    while (instances.length) {
      instances.pop()?.destroy();
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    delete (window as unknown as { Stripe?: unknown }).Stripe;
  });

  it("resizes iframe on paylio:resize message", async () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;

    window.postMessage({ type: "paylio:resize", height: 800 }, "*");

    // Wait for message event to process
    await new Promise((r) => setTimeout(r, 50));

    expect(iframe.style.height).toBe("800px");
  });

  it("handles paylio:ready message without error", async () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });

    window.postMessage({ type: "paylio:ready" }, "*");

    await new Promise((r) => setTimeout(r, 50));

    // Should not throw; iframe remains in DOM
    expect(document.querySelector("iframe")).toBeTruthy();
  });

  it("handles paylio:grid-loaded message without error", async () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });

    window.postMessage({ type: "paylio:grid-loaded" }, "*");

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector("iframe")).toBeTruthy();
  });

  it("handles paylio:checkout message without error", async () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });

    window.postMessage({ type: "paylio:checkout" }, "*");

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector("iframe")).toBeTruthy();
  });

  it("initiates checkout when authenticated users click a plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        provider: "razorpay",
        publishable_key: "rzp_test_123",
        provider_session_id: "sub_test_123",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const razorpayOpen = vi.fn();
    const razorpayCtor = vi.fn(function mockRazorpayCtor() {
      return { open: razorpayOpen };
    });
    (window as unknown as { Razorpay: typeof razorpayCtor }).Razorpay = razorpayCtor;

    mountEmbed({ publishableKey: "pk_test", userId: "user_123", country: "IN" });

    window.postMessage({ type: "paylio:grid-loaded", detected_country: "IN" }, "*");
    window.postMessage(
      {
        type: "paylio:checkout",
        planId: "plan_basic",
        priceId: "price_basic_inr_monthly",
        interval: "monthly",
        gateway: "razorpay",
      },
      "*",
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api-origin.paylio.pro/embed/v1/checkout/init");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-API-Key": "pk_test",
      }),
    );
    const payload = JSON.parse(String(requestInit.body));
    expect(payload).toEqual(
      expect.objectContaining({
        plan_id: "plan_basic",
        stripe_price_id: "price_basic_inr_monthly",
        gateway: "razorpay",
        billing_interval: "monthly",
        country: "IN",
        user_context: { user_id: "user_123" },
      }),
    );
    expect(razorpayCtor).toHaveBeenCalledTimes(1);
    expect(razorpayOpen).toHaveBeenCalledTimes(1);
  });

  it("redirects to login URL on checkout when userId is missing", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    mountEmbed({ publishableKey: "pk_test" } as any);

    window.postMessage(
      { type: "paylio:grid-loaded", login_redirect_url: "https://example.com/login" },
      "*",
    );
    window.postMessage({ type: "paylio:checkout" }, "*");

    await new Promise((r) => setTimeout(r, 50));

    expect(openSpy).toHaveBeenCalledWith("https://example.com/login", "_self");
    openSpy.mockRestore();
  });

  it("ignores paylio:resize when iframe has no parent element", async () => {
    const instance = mountEmbed({ publishableKey: "pk_test", userId: "u1" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;

    // Remove iframe from DOM manually (simulates detached state)
    const parent = iframe.parentElement;
    if (parent) parent.removeChild(iframe);

    window.postMessage({ type: "paylio:resize", height: 900 }, "*");

    await new Promise((r) => setTimeout(r, 50));

    // Height should not have changed since there's no parent
    expect(iframe.style.height).not.toBe("900px");
    instance.destroy();
  });

  it("handles message with no data gracefully", async () => {
    mountEmbed({ publishableKey: "pk_test", userId: "u1" });

    window.postMessage(null, "*");

    await new Promise((r) => setTimeout(r, 50));

    expect(document.querySelector("iframe")).toBeTruthy();
  });
});

describe("VERSION export", () => {
  it("exports VERSION as a semver string", async () => {
    const { VERSION } = await import("../src/index");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
