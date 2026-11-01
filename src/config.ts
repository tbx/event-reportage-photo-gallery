// All settings live in gallery.config.json (shared with the PHP side, which reads it as _config.json).
// PAGES_BASE (GitHub Pages demo, see scripts/pages.mjs): photos are plain static files, no gate, no statistics.
import cfg from '../gallery.config.json';

const pages = process.env.PAGES_BASE;
const base = (pages || cfg.basePath).replace(/\/+$/, '');
export const config = {
  ...cfg,
  base,
  img: (kind: 'small' | 'thumb' | 'full', id: string) =>
    pages ? `${base}/photos/${kind}/${id}.jpg` : `${base}/foto/${kind}/${cfg.downloadPrefix}${id}.jpg`,   // .htaccess -> img.php
  hit: (id: string) => pages ? '' : `${base}/hit.php?f=${id}`,   // counts photo views for stats.php
};
