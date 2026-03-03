# Paylio Embed JS

[![npm version](https://img.shields.io/npm/v/@paylio/embed-js.svg)](https://www.npmjs.com/package/@paylio/embed-js)
[![CI](https://github.com/paylio-org/paylio-embed-js/actions/workflows/ci.yml/badge.svg)](https://github.com/paylio-org/paylio-embed-js/actions/workflows/ci.yml)

The Paylio Embed SDK for JavaScript/TypeScript. Embed pricing grids and checkout flows into any web application with a single function call.

## Runtime Architecture

`@paylio/embed-js` is a thin wrapper over the hosted runtime script (`/embed/v1/js`).
All checkout and pricing behavior lives in the hosted runtime to keep a single source of truth across script-tag and SDK integrations.
The SDK loads the canonical runtime URL (`https://api.paylio.pro/embed/v1/js`) and automatically retries the legacy host (`api-origin`) if needed.

## Documentation

See the [Paylio API docs](https://paylio.pro/docs).

## Installation

```bash
npm install @paylio/embed-js
```

## Usage

```typescript
import { createPaylioEmbed } from "@paylio/embed-js";

const paylio = createPaylioEmbed({
  publishableKey: "pk_live_xxx",
  userId: "user_123", // optional
});

// Later: clean up
paylio.destroy();
```

### Custom container

```typescript
// CSS selector
const paylio = createPaylioEmbed({
  publishableKey: "pk_live_xxx",
  userId: "user_123",
  container: "#my-pricing",
});

// HTMLElement
const el = document.getElementById("my-pricing")!;
const paylio = createPaylioEmbed({
  publishableKey: "pk_live_xxx",
  userId: "user_123",
  container: el,
});
```

### Country override

```typescript
const paylio = createPaylioEmbed({
  publishableKey: "pk_live_xxx",
  userId: "user_123",
  country: "IN", // ISO 3166-1 alpha-2
});
```

By default, the country is auto-detected from the user's IP address.

## Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `publishableKey` | `string` | Yes | — | Publishable API key (`pk_...`) |
| `userId` | `string` | No | Anonymous | Your external user ID |
| `container` | `string \| HTMLElement` | No | `"#paylio-plans"` | Container for the pricing grid |
| `country` | `string` | No | Auto-detected | ISO 3166-1 alpha-2 country code |
| `scriptUrl` | `string` | No | `"https://api.paylio.pro/embed/v1/js"` | Override hosted runtime URL |

### Anonymous mode

You can omit `userId` to show plans to anonymous visitors:

```typescript
const paylio = createPaylioEmbed({
  publishableKey: "pk_live_xxx",
});
```

When an anonymous user clicks checkout, the SDK redirects to your project's configured login redirect URL.

## Script tag alternative

For non-bundled environments, use the hosted embed script directly:

```html
<div id="paylio-plans"></div>
<script
  src="https://api.paylio.pro/embed/v1/js"
  data-paylio-publishable-key="pk_live_xxx"
  data-user-id="user_123"
></script>
```

## Development

```bash
npm install
npm test
npm run lint
npm run build
```

## License

MIT
