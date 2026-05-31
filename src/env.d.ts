/// <reference types="astro/client" />

// Minimal Cloudflare binding types for SSR code. We intentionally do NOT pull
// @cloudflare/workers-types in globally — its DOM-overlapping globals clash with
// the browser DOM lib used by the /admin SPA. The few types the server needs are
// declared locally in src/server/teeny.ts.
declare namespace App {
  interface Locals {
    runtime: {
      env: Record<string, unknown> & {
        PRIMARY_DB: unknown;
        FILES?: unknown;
        APP_URL?: string;
      };
      ctx: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void };
    };
  }
}
