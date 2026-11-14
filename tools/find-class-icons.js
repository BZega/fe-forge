const fs = require('fs');
const path = require('path');

/**
 * Fills "classSprites" in src/app/data/icon-links.json with the small pixel-art class sprites
 * listed at https://eoddb.com/fefw/classes.
 *
 *   node tools/find-class-icons.js            # print matches only
 *   node tools/find-class-icons.js --write    # also save them to icon-links.json
 *
 * Needs a network that can reach eoddb.com (it is blocked on some corporate proxies).
 */
const PAGE = 'https://eoddb.com/fefw/classes';
const DATA = path.join(__dirname, '..', 'src', 'app', 'data');
const LINKS_FILE = path.join(DATA, 'icon-links.json');

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/\b(icon|sprite|image|class|fefw|fire emblem|fortune'?s weave)\b/g, '')
    .replace(/[^a-z/]+/g, ' ')
    .trim();

(async () => {
  const classes = [...new Set(JSON.parse(fs.readFileSync(path.join(DATA, 'unit-classes.json'), 'utf8')).map((c) => c.name))];
  const byKey = new Map(classes.map((name) => [normalize(name), name]));

  const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (fe-forge class sprite lookup)' } });
  if (!res.ok) throw new Error(`GET ${PAGE} -> ${res.status}`);
  const html = await res.text();

  const found = {};
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = tag.match(/\b(?:alt|title)="([^"]*)"/)?.[1];
    const raw = tag.match(/\bdata-src="([^"]+)"/)?.[1] ?? tag.match(/\bsrc="([^"]+)"/)?.[1];
    // Fall back to the file name when the image has no usable alt text.
    const label = alt || raw?.split('/').pop()?.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ');
    const name = label && byKey.get(normalize(label));
    if (name && raw && !found[name]) found[name] = new URL(raw, PAGE).href;
  }

  const missing = classes.filter((name) => !found[name]);
  console.log(`Matched ${Object.keys(found).length} of ${classes.length} classes.`);
  if (missing.length) console.log(`Missing: ${missing.join(', ')}`);

  if (process.argv.includes('--write')) {
    const links = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    links.classSprites = Object.fromEntries(classes.map((name) => [name, found[name] ?? null]));
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2) + '\n', 'utf8');
    console.log(`Saved to ${path.relative(process.cwd(), LINKS_FILE)}`);
  } else {
    console.log(JSON.stringify(found, null, 2));
  }
})().catch((error) => {
  console.error(`Class sprite lookup failed: ${error.message}`);
  process.exit(1);
});
