import { TestBed } from '@angular/core/testing';
import { Item, ITEMS, itemBaseName } from '../models/equipment';
import { RESOURCE_LINKS } from '../nav-links';
import { routes } from '../app.routes';
import { WeaponsPageComponent } from './weapons-page.component';

describe('WeaponsPageComponent', () => {
  const open = (items: readonly Item[] = ITEMS) => {
    const fixture = TestBed.createComponent(WeaponsPageComponent);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  };

  it('groups all upgrades into family cards with open details and no equip controls', () => {
    const { host, page } = open();
    const families = new Set(ITEMS.map((item) => JSON.stringify([item.WeaponType, itemBaseName(item.Name)])));
    expect(page.resultCount()).toBe(families.size);
    expect(host.querySelectorAll('app-item-card').length).toBe(families.size);
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelectorAll('.equipment-details').length).toBe(families.size);
    expect(host.querySelector('details, summary, .picker-item-chevron')).toBeNull();
    expect(page.groups().flatMap((group) => group.items).flatMap((family) => family.variants).length).toBe(ITEMS.length);
  });

  it('filters by type and a case-insensitive search through the visible controls', () => {
    const { fixture, page, host } = open();
    const type = host.querySelector<HTMLSelectElement>('select')!;
    type.value = 'Sword';
    type.dispatchEvent(new Event('change'));
    const search = host.querySelector<HTMLInputElement>('input')!;
    search.value = '  WOODEN  ';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.groups().map((group) => group.type)).toEqual(['Sword']);
    expect(page.resultCount()).toBeGreaterThan(0);
    expect(page.groups()[0].items.every((family) => family.item.Name.includes('Wooden'))).toBeTrue();
    search.value = 'no-such-item';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.resultCount()).toBe(0);
    expect(host.querySelector('.catalog-empty')!.textContent).toContain('No items match');
  });

  it('automatically supports equipment and future item types without displaying bonus stats', () => {
    const items = ['Shield', 'Mask', 'Staff', 'Accessory', 'New type'].map((type): Item => ({
      ...ITEMS[0], Name: `${type} example`, WeaponType: type, BonusStats: [{ Def: 2 }],
    }));
    const { host, page } = open(items);
    expect(page.types()).toEqual(['Shield', 'Mask', 'Staff', 'Accessory', 'New type']);
    expect(page.resultCount()).toBe(5);
    expect(host.querySelector('.equipment-details')).not.toBeNull();
    expect(host.querySelector('.equipment-extra')).toBeNull();
  });

  it('switches versions without equipping and keeps details open', () => {
    const { fixture, host } = open(ITEMS.filter((item) => itemBaseName(item.Name) === 'Wooden Sword'));
    const select = host.querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    select.value = 'Wooden Sword+3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(select.value).toBe('Wooden Sword+3');
    expect(host.querySelectorAll('app-item-card').length).toBe(1);
    expect(host.querySelector('.equipment-details')).not.toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('finds upgraded and named variants while keeping same-name types separate', () => {
    const { page } = open([
      ...ITEMS.filter((item) => itemBaseName(item.Name) === 'Answerer'),
      { ...ITEMS[0], WeaponType: 'Shield' }, ITEMS[0],
    ]);
    page.search.set('Huang');
    expect(page.resultCount()).toBe(1);
    expect(page.groups()[0].items[0].item.Name).toBe('Answerer Huang');
    page.search.set('Wooden Sword');
    expect(page.groups().map((group) => group.type)).toEqual(['Sword', 'Shield']);
  });

  it('searches descriptions as well as item names', () => {
    const { page } = open([{ ...ITEMS[0], Description: 'Unique description phrase' }]);
    page.search.set('description phrase');
    expect(page.resultCount()).toBe(1);
  });

  it('keeps cards equal height across types and centers incomplete rows', async () => {
    const items = Array.from({ length: 5 }, (_, index): Item => ({
      ...ITEMS[0], Name: `Example ${index}`, WeaponType: index === 4 ? 'Shield' : 'Sword',
      Description: index === 0 ? 'A much longer description. '.repeat(20) : 'Short description.',
    }));
    const { fixture, host } = open(items);
    document.body.appendChild(host);
    try {
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const cards = Array.from(host.querySelectorAll<HTMLElement>('app-item-card'));
      const heights = cards.map((card) => card.getBoundingClientRect().height);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      const bottomOffsets = cards.map((card) =>
        card.getBoundingClientRect().bottom - card.querySelector('.equipment-columns')!.getBoundingClientRect().bottom);
      expect(Math.max(...bottomOffsets) - Math.min(...bottomOffsets)).toBeLessThanOrEqual(1);
      const rows = Array.from(host.querySelectorAll<HTMLElement>('.equipment-columns dl > div'));
      const rowHeights = rows.map((row) => row.getBoundingClientRect().height);
      expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(1);
      for (const card of cards) {
        const area = card.querySelector('.equipment-description')!.getBoundingClientRect();
        const description = card.querySelector('.picker-item-description')!.getBoundingClientRect();
        expect(Math.abs((area.top + area.bottom - description.top - description.bottom) / 2)).toBeLessThanOrEqual(3);
      }
      const single = cards[4].getBoundingClientRect();
      const row = cards[4].parentElement!.getBoundingClientRect();
      expect(Math.abs((single.left + single.right) / 2 - (row.left + row.right) / 2)).toBeLessThanOrEqual(1);
    } finally {
      host.remove();
    }
  });

  it('is available through Resources and a lazy-loaded route', async () => {
    expect(RESOURCE_LINKS.some((link) => link.path === '/weapons')).toBeTrue();
    const route = routes.find((route) => route.path === 'weapons')!;
    expect(await route.loadComponent!()).toBe(WeaponsPageComponent);
  });
});
