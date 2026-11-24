const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const site = 'https://feforge.app';
const units = require(path.join(root, 'src/app/data/units.json'));
const classes = require(path.join(root, 'src/app/data/unit-classes.json'));

const slug = (value) => value
  .replace(/\*$/, '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/['’]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const paths = [...new Set([
  '/',
  '/growth-mapper',
  '/calculator',
  '/projected-stats',
  '/characters',
  '/classes',
  '/mounts',
  '/battalions',
  '/weapons',
  ...units.map((unit) => `/characters/${slug(unit.name)}`),
  ...classes.map((unitClass) => `/classes/${slug(unitClass.name)}`),
])];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths.map((pathname) => `  <url><loc>${site}${pathname}</loc></url>`).join('\n') +
  `\n</urlset>\n`;

fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml);
