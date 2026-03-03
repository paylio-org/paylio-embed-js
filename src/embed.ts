import type { PaylioEmbedInstance, PaylioEmbedOptions } from "./types";

const DEFAULT_CONTAINER = "#paylio-plans";
const DEFAULT_RUNTIME_SCRIPT_URL = "https://api-origin.paylio.pro/embed/v1/js";

interface PaylioRuntimeInitOptions {
  publishableKey: string;
  userId?: string;
  country?: string;
  container: string | HTMLElement;
  apiBaseUrl?: string;
  scriptSrc?: string;
}

interface PaylioRuntimeHandle {
  destroy?(): void;
}

interface PaylioRuntime {
  init(options: PaylioRuntimeInitOptions): PaylioRuntimeHandle | null;
}

type PaylioWindow = Window & {
  PaylioEmbed?: PaylioRuntime;
};

interface RuntimeLoadResult {
  runtime: PaylioRuntime | null;
  script: HTMLScriptElement | null;
  created: boolean;
}

const runtimeLoadPromises = new Map<string, Promise<RuntimeLoadResult>>();
let generatedContainerCounter = 0;

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

function ensureContainerId(containerEl: HTMLElement): string {
  if (!containerEl.id) {
    generatedContainerCounter += 1;
    containerEl.id = `paylio-plans-${generatedContainerCounter}`;
  }
  return containerEl.id;
}

function normalizeScriptUrl(scriptUrl: string | undefined): string {
  const value = scriptUrl?.trim();
  if (!value) {
    return DEFAULT_RUNTIME_SCRIPT_URL;
  }

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`[Paylio] Invalid scriptUrl: ${value}`);
  }
}

function deriveApiBaseUrl(scriptUrl: string): string {
  try {
    return new URL(scriptUrl).origin;
  } catch {
    return "https://api-origin.paylio.pro";
  }
}

function getRuntime(): PaylioRuntime | null {
  const runtime = (window as PaylioWindow).PaylioEmbed;
  if (!runtime || typeof runtime.init !== "function") {
    return null;
  }
  return runtime;
}

function findExistingScript(scriptUrl: string): HTMLScriptElement | null {
  const scripts = Array.from(document.getElementsByTagName("script"));
  return (
    scripts.find((script): script is HTMLScriptElement => script instanceof HTMLScriptElement && script.src === scriptUrl) ??
    null
  );
}

function markScriptLoaded(script: HTMLScriptElement): void {
  script.setAttribute("data-paylio-runtime-loaded", "1");
}

function isScriptLoaded(script: HTMLScriptElement): boolean {
  return script.getAttribute("data-paylio-runtime-loaded") === "1";
}

function loadHostedRuntime(
  scriptUrl: string,
  bootstrapAttributes: Record<string, string>,
): Promise<RuntimeLoadResult> {
  const existingRuntime = getRuntime();
  if (existingRuntime) {
    const existingScript = findExistingScript(scriptUrl);
    return Promise.resolve({ runtime: existingRuntime, script: existingScript, created: false });
  }

  const inFlight = runtimeLoadPromises.get(scriptUrl);
  if (inFlight) {
    return inFlight;
  }

  const loadPromise = new Promise<RuntimeLoadResult>((resolve, reject) => {
    const existingScript = findExistingScript(scriptUrl);
    if (existingScript) {
      if (getRuntime()) {
        resolve({ runtime: getRuntime(), script: existingScript, created: false });
        return;
      }

      if (isScriptLoaded(existingScript)) {
        resolve({ runtime: null, script: existingScript, created: false });
        return;
      }

      existingScript.addEventListener(
        "load",
        () => {
          markScriptLoaded(existingScript);
          resolve({ runtime: getRuntime(), script: existingScript, created: false });
        },
        { once: true },
      );
      existingScript.addEventListener(
        "error",
        () => reject(new Error(`[Paylio] Failed to load hosted runtime from ${scriptUrl}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;

    Object.entries(bootstrapAttributes).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    script.onload = () => {
      markScriptLoaded(script);
      resolve({ runtime: getRuntime(), script, created: true });
    };
    script.onerror = () => {
      reject(new Error(`[Paylio] Failed to load hosted runtime from ${scriptUrl}`));
    };

    document.head.appendChild(script);
  }).finally(() => {
    runtimeLoadPromises.delete(scriptUrl);
  });

  runtimeLoadPromises.set(scriptUrl, loadPromise);
  return loadPromise;
}

function createLegacyCleanupHandle(containerEl: HTMLElement): PaylioRuntimeHandle {
  return {
    destroy(): void {
      const embedIframes = Array.from(containerEl.querySelectorAll("iframe")).filter((iframe) =>
        iframe.src.includes("/embed/routing/plans?"),
      );
      embedIframes.forEach((iframe) => iframe.remove());
    },
  };
}

/**
 * Thin wrapper around the hosted Paylio runtime script.
 */
export function createPaylioEmbed(options: PaylioEmbedOptions): PaylioEmbedInstance {
  if (!options.publishableKey || !options.publishableKey.trim()) {
    throw new Error("[Paylio] publishableKey is required. Pass your publishable key (pk_...).");
  }

  const containerEl = resolveContainer(options.container);
  const containerId = ensureContainerId(containerEl);
  const normalizedUserId = options.userId?.trim() || undefined;
  const normalizedCountry = options.country?.trim() || undefined;
  const scriptUrl = normalizeScriptUrl(options.scriptUrl);

  const bootstrapAttributes: Record<string, string> = {
    "data-paylio-sdk-runtime": "1",
    "data-paylio-publishable-key": options.publishableKey,
    "data-container": containerId,
  };
  if (normalizedUserId) {
    bootstrapAttributes["data-user-id"] = normalizedUserId;
  }
  if (normalizedCountry) {
    bootstrapAttributes["data-country"] = normalizedCountry;
  }

  let destroyed = false;
  let runtimeHandle: PaylioRuntimeHandle | null = null;

  void loadHostedRuntime(scriptUrl, bootstrapAttributes)
    .then((result) => {
      if (destroyed) {
        return;
      }

      if (result.runtime) {
        runtimeHandle = result.runtime.init({
          publishableKey: options.publishableKey,
          userId: normalizedUserId,
          country: normalizedCountry,
          container: containerEl,
          apiBaseUrl: deriveApiBaseUrl(scriptUrl),
          scriptSrc: scriptUrl,
        });
        return;
      }

      if (result.created) {
        // Legacy runtime mode: auto-init happened from script-tag dataset.
        runtimeHandle = createLegacyCleanupHandle(containerEl);
        return;
      }

      console.error(
        "[Paylio] Hosted runtime API is unavailable and legacy runtime already exists on page.",
      );
    })
    .catch((error) => {
      console.error("[Paylio] Failed to initialize hosted runtime:", error);
    });

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      if (runtimeHandle && typeof runtimeHandle.destroy === "function") {
        runtimeHandle.destroy();
      }

      runtimeHandle = null;
    },
  };
}
