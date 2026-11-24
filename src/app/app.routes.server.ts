import { RenderMode, ServerRoute } from '@angular/ssr';
import units from './data/units.json';
import classes from './data/unit-classes.json';
import { prerenderParams } from './models/route-params';

const prerenderPaths = [
  '',
  'growth-mapper',
  'seed-mapper',
  'calculator',
  'projected-stats',
  'characters',
  'classes',
  'mounts',
  'battalions',
  'weapons',
];

export const serverRoutes: ServerRoute[] = [
  ...prerenderPaths.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  {
    path: 'characters/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return prerenderParams(units);
    },
  },
  {
    path: 'classes/:id',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return prerenderParams(classes);
    },
  },
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
