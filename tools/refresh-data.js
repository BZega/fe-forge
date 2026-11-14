const fs = require('fs');
const path = require('path');
const BASE = (process.argv[2] ?? 'http://localhost:5081').replace(/\/$/, '') + '/api';
const OUT = path.join(__dirname, '..', 'src', 'app', 'data');

const get = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
};

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n', 'utf8');

(async () => {
  const [units, classes, mounts] = await Promise.all([
    get('/units'),
    get('/unitclasses'),
    get('/mounts'),
  ]);

  const mountTypes = {};
  for (const unitClass of classes) {
    mountTypes[unitClass.name] = await get(`/unitclasses/${unitClass.id}/mount-type`);
  }

  const current = JSON.parse(fs.readFileSync(path.join(OUT, 'units.json'), 'utf8'));
  const origins = new Map(current.map((unit) => [unit.name, unit.origin]));
  const withOrigin = units.map(({ id, name, ...rest }) => ({ id, name, origin: origins.get(name) ?? 'Commoner', ...rest }));

  write('units.json', withOrigin.sort((a, b) => a.name.localeCompare(b.name)));
  write('unit-classes.json', classes);
  write('mounts.json', mounts);
  write('class-mount-types.json', mountTypes);

  const mounted = Object.values(mountTypes).filter((t) => t !== 'None').length;
  console.log(
    `units=${units.length} classes=${classes.length} mounts=${mounts.length} mountedClasses=${mounted}`,
  );
})().catch((error) => {
  console.error(`Refresh failed: ${error.message}`);
  console.error('Is FE.Growth.API running?');
  process.exit(1);
});
