/**
 * Configuration options for creating a Paylio embed instance.
 */
export interface PaylioEmbedOptions {
  /** Publishable API key (pk_...) */
  publishableKey: string;

  /** External user ID from your system (optional for anonymous mode) */
  userId?: string;

  /**
   * Container to mount the pricing grid.
   * Accepts a CSS selector string or an HTMLElement.
   * @default "#paylio-plans"
   */
  container?: string | HTMLElement;

  /**
   * ISO 3166-1 alpha-2 country code for region-specific pricing.
   * Auto-detected from IP if not provided.
   */
  country?: string;

  /**
   * Override hosted runtime script URL.
   * @default "https://api-origin.paylio.pro/embed/v1/js"
   */
  scriptUrl?: string;
}

/**
 * Handle returned by createPaylioEmbed for lifecycle management.
 */
export interface PaylioEmbedInstance {
  /** Remove the embed iframe and clean up event listeners */
  destroy(): void;
}
