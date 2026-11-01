// All settings live in gallery.config.json (shared with the PHP side, which reads it as _config.json).
import cfg from '../gallery.config.json';

const base = cfg.basePath.replace(/\/+$/, '');
export const config = {
  ...cfg,
  base,
  img: (kind: 'small' | 'thumb' | 'full', id: string) => `${base}/foto/${kind}/${cfg.downloadPrefix}${id}.jpg`,   // .htaccess -> img.php
  hit: (id: string) => `${base}/hit.php?f=${id}`,   // counts photo views for stats.php
};
