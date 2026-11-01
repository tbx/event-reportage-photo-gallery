import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('./gallery.config.json', import.meta.url), 'utf8'));
// PAGES_BASE=/repo-name builds the static demo for GitHub Pages (no PHP, no password), see scripts/pages.mjs
const pages = process.env.PAGES_BASE;
export default defineConfig({
  site: pages ? (process.env.PAGES_SITE || cfg.siteUrl) : cfg.siteUrl,
  base: pages || cfg.basePath,
  trailingSlash: 'ignore',
  build: { format: 'file', assets: 'assets' },
});
