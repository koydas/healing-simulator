/**
 * The asset base and the SPA fallback are coupled, and the coupling is silent
 * when it breaks: `nginx/default.conf` answers any unknown path with
 * `index.html`, so a relative base makes a page served for `/some/route`
 * resolve its assets to `/some/assets/…`. Nothing matches `location /assets/`,
 * the catch-all returns HTML, and the browser refuses it as a module script —
 * a blank page whose only symptom is one MIME-type line in the console.
 *
 * Measured before the fix, Chromium 390 × 844 against a server replicating the
 * Nginx config: `/` rendered 5 party frames, `/some/route` rendered 0.
 *
 * See docs/adr/0011-root-relative-asset-base.md.
 */

import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

describe('the built asset base', () => {
  const config = viteConfig as { base?: string };

  it('is root-relative, so the SPA fallback boots on any path', () => {
    expect(config.base).toBe('/');
  });

  it('is not relative, which would break every fallback page', () => {
    expect(config.base?.startsWith('.')).toBe(false);
  });

  it('is absolute, so a sub-path build stays explicit about its prefix', () => {
    // `--base=/sim/` overrides this at build time; what must never come back
    // is a base the browser resolves against the current URL.
    expect(config.base?.startsWith('/')).toBe(true);
  });
});
