/// <reference types="astro/client" />

// Minimal Cloudflare types for SSR code. We intentionally do NOT pull
// @cloudflare/workers-types in globally — its DOM-overlapping globals clash with
// the browser DOM lib used by the /admin SPA. Bindings are accessed via
// `import { env } from "cloudflare:workers"`; the ExecutionContext is on
// Astro.locals.cfContext (Astro v6).
declare namespace App {
  interface Locals {
    cfContext?: {
      waitUntil(p: Promise<unknown>): void;
      passThroughOnException(): void;
    };
  }
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown> & {
    PRIMARY_DB: unknown;
    FILES?: unknown;
    APP_URL?: string;
  };
}
