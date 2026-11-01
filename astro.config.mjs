import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('./gallery.config.json', import.meta.url), 'utf8'));
export default defineConfig({
  site: cfg.siteUrl,
  base: cfg.basePath,
  trailingSlash: 'ignore',
  build: { format: 'file', assets: 'assets' },
});
