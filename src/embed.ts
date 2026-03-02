import type { PaylioEmbedOptions, PaylioEmbedInstance } from "./types";

const FRONTEND_URL = "https://paylio.pro";
const DEFAULT_CONTAINER = "#paylio-plans";

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
        }
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
