const fs = require('fs');
const path = require('path');

/**
 * Fills icon links in src/app/data/icon-links.json from eoddb.com:
 *   classSprites  <- small pixel-art class sprites   (unit-classes.json names)
 *   abilityIcons  <- class / master ability icons     (class-abilities.json names)
 *
 *   node tools/find-class-icons.js            # print matches only
 *   node tools/find-class-icons.js --write    # also save them to icon-links.json
 *
 * Needs a network that can reach eoddb.com (it is blocked on some corporate proxies).
 */
const TARGETS = [
  { key: 'classSprites', page: 'https://eoddb.com/fefw/img/classes', data: 'unit-classes.json' },
  { key: 'abilityIcons', page: 'https://eoddb.com/fefw/abilities', data: 'class-abilities.json' },
];
const DATA = path.join(__dirname, '..', 'src', 'app', 'data');
const LINKS_FILE = path.join(DATA, 'icon-links.json');

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/\+/g, ' plus ')
    .replace(/\b(icon|sprite|image|class|ability|fefw|fire emblem|fortune'?s weave)\b/g, '')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();

async function lookUp({ page, data }) {
  const names = [...new Set(JSON.parse(fs.readFileSync(path.join(DATA, data), 'utf8')).map((item) => item.name))];
  const byKey = new Map(names.map((name) => [normalize(name), name]));

  const res = await fetch(page, { headers: { 'User-Agent': 'Mozilla/5.0 (fe-forge icon lookup)' } });
  if (!res.ok) throw new Error(`GET ${page} -> ${res.status}`);
  const html = await res.text();

  const found = {};
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = tag.match(/\b(?:alt|title)="([^"]*)"/)?.[1];
    const raw = tag.match(/\bdata-src="([^"]+)"/)?.[1] ?? tag.match(/\bsrc="([^"]+)"/)?.[1];
    // Fall back to the file name when the image has no usable alt text.
    const label = alt || raw?.split('/').pop()?.replace(/\.\w+(\?.*)?$/, '').replace(/[_-]+/g, ' ');
    const name = label && byKey.get(normalize(label));
    if (name && raw && !found[name]) found[name] = new URL(raw, page).href;
  }

  return { names, found };
}

(async () => {
  const links = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));

  for (const target of TARGETS) {
    try {
      const { names, found } = await lookUp(target);
      const missing = names.filter((name) => !found[name]);
      console.log(`${target.key}: matched ${Object.keys(found).length} of ${names.length}.`);
      if (missing.length) console.log(`  Missing: ${missing.join(', ')}`);
      if (!process.argv.includes('--write')) console.log(JSON.stringify(found, null, 2));
      links[target.key] = Object.fromEntries(names.map((name) => [name, found[name] ?? null]));
    } catch (error) {
      console.error(`${target.key}: lookup failed (${error.message}); leaving it unchanged.`);
    }
  }

  if (process.argv.includes('--write')) {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2) + '\n', 'utf8');
    console.log(`Saved to ${path.relative(process.cwd(), LINKS_FILE)}`);
  }
})();
