import type { PaylioEmbedOptions, PaylioEmbedInstance } from "./types";

const FRONTEND_URL = "https://www.paylio.pro";
const API_BASE_URL = "https://api-origin.paylio.pro";
const DEFAULT_CONTAINER = "#paylio-plans";
const STRIPE_JS_URL = "https://js.stripe.com/v3/";
const RAZORPAY_JS_URL = "https://checkout.razorpay.com/v1/checkout.js";

interface RedirectUrls {
  login: string | null;
  success: string | null;
  failure: string | null;
}

interface CheckoutInitResponse {
  provider: "stripe" | "razorpay";
  publishable_key?: string;
  client_secret?: string | null;
  provider_session_id?: string;
}

interface StripeEmbeddedCheckout {
  mount(selector: string): void;
  destroy(): void;
}

interface StripeInstance {
  initEmbeddedCheckout(options: { clientSecret: string }): Promise<StripeEmbeddedCheckout>;
}

type StripeFactory = (publishableKey: string) => StripeInstance;

interface RazorpayInstance {
  open(): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

type PaylioWindow = Window & {
  Stripe?: StripeFactory;
  Razorpay?: RazorpayConstructor;
};

/**
 * Resolve a container option to an HTMLElement.
 */
function resolveContainer(container: string | HTMLElement | undefined): HTMLElement {
  if (container instanceof HTMLElement) {
    return container;
  }

  const selector = container ?? DEFAULT_CONTAINER;
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`[Paylio] Container element not found: ${selector}`);
  }
  return el as HTMLElement;
}

/**
 * Build the iframe URL for the embed pricing grid.
 */
function buildIframeUrl(options: PaylioEmbedOptions, normalizedUserId?: string): string {
  const params = new URLSearchParams({
    api_key: options.publishableKey,
    frequency: "monthly",
  });

  if (normalizedUserId) {
    params.set("user_id", normalizedUserId);
  }

  if (options.country) {
    params.set("country", options.country);
  }

  return `${FRONTEND_URL}/embed/routing/plans?${params}`;
}

function showLoadingModal(): HTMLElement {
  const existing = document.getElementById("paylio-loading-modal");
  if (existing) return existing;

  const overlay = document.createElement("div");
  overlay.id = "paylio-loading-modal";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 28px 30px;
      max-width: 390px;
      width: 90%;
      text-align: center;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      font-family: 'Inter', 'Satoshi', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">
      <div style="
        width: 42px;
        height: 42px;
        border: 3px solid #dbe4ef;
        border-top-color: #0A1128;
        border-radius: 50%;
        animation: paylio-spin 1s linear infinite;
        margin: 0 auto 16px;
      "></div>
      <div style="
        color: #0f172a;
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 6px;
      ">Preparing checkout...</div>
      <div style="
        color: #475569;
        font-size: 14px;
        line-height: 1.45;
      ">One moment while we securely load payment details.</div>
    </div>
  `;

  if (!document.getElementById("paylio-spinner-style")) {
    const style = document.createElement("style");
    style.id = "paylio-spinner-style";
    style.textContent = "@keyframes paylio-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  return overlay;
}

function removeLoadingModal(): void {
  const modal = document.getElementById("paylio-loading-modal");
  if (modal) {
    document.body.removeChild(modal);
  }
}

function loadScriptOnce(src: string, globalName: "Stripe" | "Razorpay"): Promise<void> {
  const win = window as PaylioWindow;
  if (win[globalName]) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${globalName}`));
    document.head.appendChild(script);
  });
}

async function loadStripe(): Promise<StripeFactory> {
  await loadScriptOnce(STRIPE_JS_URL, "Stripe");
  const stripeFactory = (window as PaylioWindow).Stripe;
  if (!stripeFactory) {
    throw new Error("Stripe is unavailable after script load");
  }
  return stripeFactory;
}

async function loadRazorpay(): Promise<RazorpayConstructor> {
  await loadScriptOnce(RAZORPAY_JS_URL, "Razorpay");
  const razorpay = (window as PaylioWindow).Razorpay;
  if (!razorpay) {
    throw new Error("Razorpay is unavailable after script load");
  }
  return razorpay;
}

function showRazorpayModal(data: CheckoutInitResponse, redirectUrls: RedirectUrls): void {
  const Razorpay = (window as PaylioWindow).Razorpay;
  if (!Razorpay) {
    throw new Error("Razorpay SDK is not loaded");
  }

  const options = {
    key: data.publishable_key,
    subscription_id: data.provider_session_id,
    name: "Paylio Subscription",
    description: "Complete your subscription",
    handler: () => {
      if (redirectUrls.success) {
        window.location.href = redirectUrls.success;
      }
    },
    modal: {
      ondismiss: () => undefined,
    },
    theme: {
      color: "#6366f1",
    },
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

async function showStripeModal(stripe: StripeInstance, clientSecret: string | null | undefined): Promise<void> {
  const overlay = document.createElement("div");
  overlay.id = "paylio-payment-modal";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="
      background: #ffffff;
      border-radius: 24px;
      padding: 0;
      max-width: 500px;
      width: 95%;
      position: relative;
      max-height: 90vh;
      overflow-y: auto;
      overflow-x: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    ">
      <button id="paylio-close" style="
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0,0,0,0.1);
        border: none;
        color: #333;
        font-size: 20px;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
      ">&times;</button>
      <div id="paylio-checkout-container" style="min-height: 500px;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const checkoutContainer = document.getElementById("paylio-checkout-container");
  if (!checkoutContainer) return;

  if (!clientSecret) {
    checkoutContainer.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #dc2626;">
        <p>Payment setup failed. Please try again or contact support.</p>
      </div>
    `;
    return;
  }

  try {
    const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
    checkout.mount("#paylio-checkout-container");

    const closeButton = document.getElementById("paylio-close");
    if (closeButton) {
      closeButton.onclick = () => {
        checkout.destroy();
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      };
    }
  } catch (error) {
    checkoutContainer.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #dc2626;">
        <p>Failed to load checkout: ${error instanceof Error ? error.message : "Unknown error"}</p>
      </div>
    `;
  }
}

/**
 * Create and mount the pricing grid iframe.
 */
export function createPaylioEmbed(options: PaylioEmbedOptions): PaylioEmbedInstance {
  // ── Validation ──────────────────────────────────────────────────
  if (!options.publishableKey || !options.publishableKey.trim()) {
    throw new Error("[Paylio] publishableKey is required. Pass your publishable key (pk_...).");
  }

  const normalizedUserId = options.userId?.trim();

  // ── Resolve container ───────────────────────────────────────────
  const containerEl = resolveContainer(options.container);

  // ── Create iframe ───────────────────────────────────────────────
  const iframe = document.createElement("iframe");
  iframe.id = "paylio-embed-iframe";
  iframe.src = buildIframeUrl(options, normalizedUserId);
  iframe.style.width = "100%";
  iframe.style.border = "none";
  iframe.style.minHeight = "500px";
  iframe.style.background = "transparent";
  iframe.setAttribute("allowtransparency", "true");
  iframe.setAttribute("frameborder", "0");

  containerEl.appendChild(iframe);

  // Populated when iframe sends paylio:grid-loaded.
  let loginRedirectUrl: string | null = null;
  const redirectUrls: RedirectUrls = {
    login: null,
    success: null,
    failure: null,
  };
  let detectedCountry = options.country?.trim() || "US";

  async function handleCheckout(data: Record<string, unknown>): Promise<void> {
    const planId = typeof data.planId === "string" ? data.planId : "";
    const priceId = typeof data.priceId === "string" ? data.priceId : "";
    const interval = typeof data.interval === "string" ? data.interval : "monthly";
    const gateway = typeof data.gateway === "string" ? data.gateway : "stripe";
    const stripePublishableKey =
      typeof data.stripePublishableKey === "string" ? data.stripePublishableKey : undefined;

    if (!planId || !priceId) {
      console.error("[Paylio] Missing checkout payload from embed iframe.");
      return;
    }

    showLoadingModal();

    try {
      const response = await fetch(`${API_BASE_URL}/embed/v1/checkout/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": options.publishableKey,
        },
        body: JSON.stringify({
          plan_id: planId,
          stripe_price_id: priceId,
          gateway,
          billing_interval: interval,
          country: detectedCountry,
          user_context: {
            user_id: normalizedUserId,
          },
        }),
      });

      if (response.status === 409) {
        removeLoadingModal();
        return;
      }

      if (!response.ok) {
        throw new Error(`Checkout failed with status ${response.status}`);
      }

      const checkoutData = (await response.json()) as CheckoutInitResponse;
      removeLoadingModal();

      if (checkoutData.provider === "razorpay") {
        await loadRazorpay();
        showRazorpayModal(checkoutData, redirectUrls);
        return;
      }

      const stripeFactory = await loadStripe();
      const publishableKey = stripePublishableKey || checkoutData.publishable_key;
      if (!publishableKey) {
        throw new Error("Stripe publishable key is missing from checkout payload.");
      }
      const stripe = stripeFactory(publishableKey);
      await showStripeModal(stripe, checkoutData.client_secret);
    } catch (error) {
      removeLoadingModal();
      console.error("[Paylio] Checkout error:", error);
    }
  }

  // ── Message handler ─────────────────────────────────────────────
  function handleMessage(event: MessageEvent): void {
    const { type, ...data } = event.data || {};

    switch (type) {
      case "paylio:ready":
        break;

      case "paylio:resize":
        if (data.height && iframe.parentElement) {
          iframe.style.height = `${data.height}px`;
        }
        break;

      case "paylio:grid-loaded":
        if (typeof data.login_redirect_url === "string" && data.login_redirect_url.trim()) {
          loginRedirectUrl = data.login_redirect_url;
        }
        if (typeof data.success_redirect_url === "string" && data.success_redirect_url.trim()) {
          redirectUrls.success = data.success_redirect_url;
        }
        if (typeof data.failure_redirect_url === "string" && data.failure_redirect_url.trim()) {
          redirectUrls.failure = data.failure_redirect_url;
        }
        if (typeof data.detected_country === "string" && data.detected_country.trim()) {
          detectedCountry = data.detected_country;
        }
        break;

      case "paylio:checkout":
        if (!normalizedUserId) {
          if (loginRedirectUrl) {
            window.open(loginRedirectUrl, "_self");
          } else {
            console.error(
              "[Paylio] Anonymous checkout requires login_redirect_url from embed grid.",
            );
          }
          break;
        }
        void handleCheckout(data);
        break;
    }
  }

  window.addEventListener("message", handleMessage);

  // ── Destroy handle ──────────────────────────────────────────────
  let destroyed = false;

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      window.removeEventListener("message", handleMessage);

      if (iframe.parentElement) {
        iframe.parentElement.removeChild(iframe);
      }
    },
  };
}
