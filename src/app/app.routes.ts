import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Fire Emblem Forge',
    loadComponent: () =>
      import('./home-page/home-page.component').then((m) => m.HomePageComponent),
  },
  {
    path: 'growth-mapper',
    data: { spoilerData: 'builds' },
    title: 'Growth Mapper',
    loadComponent: () =>
      import('./seed-mapper-page/seed-mapper-page.component').then(
        (m) => m.SeedMapperPageComponent,
      ),
  },
  { path: 'seed-mapper', redirectTo: 'growth-mapper' },
  {
    path: 'calculator',
    data: { spoilerData: 'builds' },
    title: 'Growth Calculator',
    loadComponent: () =>
      import('./calculator-page/calculator-page.component').then(
        (m) => m.CalculatorPageComponent,
      ),
  },
  {
    path: 'projected-stats',
    data: { spoilerData: 'builds' },
    title: 'Projected Stats',
    loadComponent: () =>
      import('./projected-stats-page/projected-stats-page.component').then(
        (m) => m.ProjectedStatsPageComponent,
      ),
  },
  {
    path: 'characters',
    data: { spoilerData: 'units' },
    title: 'Characters',
    loadComponent: () =>
      import('./units-page/units-page.component').then((m) => m.UnitsPageComponent),
  },
  {
    path: 'characters/:id',
    data: { spoilerData: 'builds' },
    title: 'Character',
    loadComponent: () =>
      import('./character-page/character-page.component').then(
        (m) => m.CharacterPageComponent,
      ),
  },
  {
    path: 'classes',
    data: { spoilerData: 'classes' },
    title: 'Classes',
    loadComponent: () =>
      import('./classes-page/classes-page.component').then(
        (m) => m.ClassesPageComponent,
      ),
  },
  {
    path: 'classes/:id',
    data: { spoilerData: 'classes' },
    title: 'Class',
    loadComponent: () =>
      import('./class-page/class-page.component').then((m) => m.ClassPageComponent),
  },
  {
    path: 'mounts',
    data: { spoilerData: 'mounts' },
    title: 'Mounts',
    loadComponent: () =>
      import('./mounts-page/mounts-page.component').then((m) => m.MountsPageComponent),
  },
  {
    path: 'battalions',
    title: 'Battalions',
    loadComponent: () =>
      import('./battalions-page/battalions-page.component').then(
        (m) => m.BattalionsPageComponent,
      ),
  },
  {
    path: 'weapons',
    title: 'Weapons',
    loadComponent: () =>
      import('./weapons-page/weapons-page.component').then((m) => m.WeaponsPageComponent),
  },
  { path: '**', redirectTo: '' },
];
