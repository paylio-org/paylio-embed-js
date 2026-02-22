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
function buildIframeUrl(options: PaylioEmbedOptions): string {
  const params = new URLSearchParams({
    api_key: options.publishableKey,
    frequency: "monthly",
  });

  params.set("user_id", options.userId);

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

  if (!options.userId || !options.userId.trim()) {
    throw new Error("[Paylio] userId is required. Pass your external user ID.");
  }

  // ── Resolve container ───────────────────────────────────────────
  const containerEl = resolveContainer(options.container);

  // ── Create iframe ───────────────────────────────────────────────
  const iframe = document.createElement("iframe");
  iframe.id = "paylio-embed-iframe";
  iframe.src = buildIframeUrl(options);
  iframe.style.width = "100%";
  iframe.style.border = "none";
  iframe.style.minHeight = "500px";
  iframe.style.background = "transparent";
  iframe.setAttribute("allowtransparency", "true");
  iframe.setAttribute("frameborder", "0");

  containerEl.appendChild(iframe);

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
        // Store redirect URLs for future checkout handling
        break;

      case "paylio:checkout":
        // Checkout is handled by the iframe + embed script flow
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
