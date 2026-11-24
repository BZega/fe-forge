import { routeSlug } from './route-slug';
import { prerenderParams } from './route-params';

describe('SEO route slugs', () => {
  it('creates stable readable slugs for punctuation and special variants', () => {
    expect(routeSlug('Noble/Commoner')).toBe('noble-commoner');
    expect(routeSlug('Mu*')).toBe('mu');
    expect(routeSlug('Warrior’s Blood')).toBe('warriors-blood');
  });

  it('includes both canonical slugs and legacy numeric params for prerendering', () => {
    expect(prerenderParams([{ id: 2, name: 'Gladiator' }])).toEqual([
      { id: 'gladiator' },
      { id: '2' },
    ]);
    expect(prerenderParams([
      { id: 29, name: 'Mu' },
      { id: 57, name: 'Mu*' },
    ])).toEqual([
      { id: 'mu' },
      { id: '29' },
      { id: '57' },
    ]);
  });
});
