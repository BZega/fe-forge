import { TestBed } from '@angular/core/testing';
import { Item, ITEMS } from '../models/equipment';
import { ItemCardComponent } from './item-card.component';

describe('ItemCardComponent', () => {
  for (const type of ['Sword', 'Spear', 'Axe', 'Bow']) {
    for (const special of ['cursed', 'prototype']) {
      it(`uses checked and unchecked ${special} ${type} icons`, () => {
        const { fixture, host } = open();
        fixture.componentRef.setInput('selectable', true);
        fixture.componentRef.setInput('item', {
          ...ITEMS[0], WeaponType: type,
          Name: special === 'prototype' ? 'Prototype example' : 'Example',
          Curse: special === 'cursed' ? '10' : '--',
        });
        fixture.detectChanges();
        const icon = () => host.querySelector<HTMLImageElement>('.equipment-name img')!;
        expect(icon().getAttribute('src')).toBe(`icons/equipment/${special}_${type.toLowerCase()}_disabled.png`);
        fixture.componentRef.setInput('selected', true);
        fixture.detectChanges();
        expect(icon().getAttribute('src')).toBe(`icons/equipment/${special}_${type.toLowerCase()}_enabled.png`);
      });
    }

    it('uses enabled special icons on read-only resource cards', () => {
      const { fixture, host } = open();
      for (const [name, curse, prefix] of [['Example', '10', 'cursed'], ['Prototype example', '--', 'prototype']]) {
        fixture.componentRef.setInput('item', { ...ITEMS[0], Name: name, Curse: curse });
        fixture.detectChanges();
        expect(host.querySelector('.equipment-name img')!.getAttribute('src')).toBe(`icons/equipment/${prefix}_sword_enabled.png`);
      }
      expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    });
  }

  for (const type of ['Shield', 'Staff', 'Mask', 'Accessory']) {
    it(`uses normal and cursed ${type} equipment icons`, () => {
      const { fixture, host } = open();
      fixture.componentRef.setInput('item', { ...ITEMS[0], WeaponType: type });
      fixture.detectChanges();
      expect(host.querySelector('.equipment-name img')!.getAttribute('src')).toBe(`icons/equipment/${type.toLowerCase()}.png`);
      fixture.componentRef.setInput('item', { ...ITEMS[0], WeaponType: type, Curse: '0' });
      fixture.detectChanges();
      expect(host.querySelector('.equipment-name img')!.getAttribute('src')).toBe(`icons/equipment/cursed_${type.toLowerCase()}.png`);
    });
  }

  it('highlights increased maximum durability without shifting the value', () => {
    const { fixture, host } = open();
    const base = { ...ITEMS[0], Durability: '10/10' };
    const upgrade = { ...base, Name: 'Wooden Sword+1', Durability: '15/15' };
    fixture.componentRef.setInput('variants', [base, upgrade]);
    fixture.componentRef.setInput('item', upgrade);
    fixture.componentRef.setInput('highlightUpgrades', true);
    fixture.detectChanges();
    const durability = host.querySelector('.equipment-durability')!;
    expect(durability.classList.contains('stat-bonus')).toBeTrue();
    expect(durability.textContent).toBe('15/15');
    for (const value of ['5/10', '5/5', '--']) {
      fixture.componentRef.setInput('item', { ...upgrade, Durability: value });
      fixture.detectChanges();
      expect(durability.classList.contains('stat-bonus')).toBeFalse();
    }
  });

  it('keeps upgraded values aligned without reserving space for the arrow', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('variants', [ITEMS[0], { ...ITEMS[0], Name: 'Wooden Sword+1', Mt: 3 }]);
    fixture.componentRef.setInput('item', { ...ITEMS[0], Name: 'Wooden Sword+1', Mt: 3 });
    document.body.appendChild(host);
    try {
      fixture.componentRef.setInput('alwaysExpanded', true);
      fixture.detectChanges();
      const value = host.querySelector<HTMLElement>('.equipment-columns dd')!;
      const right = value.getBoundingClientRect().right;
      fixture.componentRef.setInput('highlightUpgrades', true);
      fixture.detectChanges();
      expect(value.classList.contains('stat-bonus')).toBeTrue();
      expect(value.getBoundingClientRect().right).toBe(right);
      expect(getComputedStyle(value).marginRight).toBe('0px');
    } finally {
      host.remove();
    }
  });

  it('marks numeric upgrade improvements against the base, including reduced weight', () => {
    const { fixture, card, host } = open();
    const base: Item = { ...ITEMS[0], Wt: 4, Avo: 5 };
    const upgrade: Item = { ...base, Name: `${base.Name}+1`, Mt: 3, Hit: 95, Crit: 2, Wt: 3, Avo: 4 };
    fixture.componentRef.setInput('variants', [base, upgrade]);
    fixture.componentRef.setInput('item', upgrade);
    fixture.detectChanges();
    expect(card.improvedFields().size).toBe(0);
    fixture.componentRef.setInput('highlightUpgrades', true);
    fixture.detectChanges();
    expect([...card.improvedFields()]).toEqual(['Mt', 'Hit', 'Crit', 'Wt']);
    expect(host.querySelectorAll('dd.stat-bonus').length).toBe(4);
    fixture.componentRef.setInput('item', base);
    fixture.detectChanges();
    expect(host.querySelector('.stat-bonus')).toBeNull();
  });

  it('compares magic power and ignores placeholders and families without a base', () => {
    const { fixture, card } = open();
    const base: Item = { ...ITEMS[0], Pwr: 2, Hit: '--' };
    const upgrade: Item = { ...base, Name: `${base.Name}+1`, Pwr: 4, Hit: 90 };
    fixture.componentRef.setInput('variants', [base, upgrade]);
    fixture.componentRef.setInput('item', upgrade);
    fixture.componentRef.setInput('highlightUpgrades', true);
    fixture.detectChanges();
    expect([...card.improvedFields()]).toEqual(['Mt']);
    fixture.componentRef.setInput('variants', [upgrade]);
    fixture.detectChanges();
    expect(card.improvedFields().size).toBe(0);
  });

  const vulnerary: Item = {
    Name: 'Vulnerary', Description: 'Restores 20 HP', Durability: '3',
    WeaponType: 'Item', EffectiveType: [], Skills: [],
    Mt: '--', Hit: '--', Crit: '--', Curse: '--', Wt: '--', Avo: '--', Range: '--',
  };
  const open = () => {
    const fixture = TestBed.createComponent(ItemCardComponent);
    fixture.componentRef.setInput('item', ITEMS[0]);
    fixture.detectChanges();
    return { fixture, card: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  };

  it('renders independently as a read-only item with expandable details', () => {
    const { host } = open();
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('.equipment-name-text')!.textContent).toBe('Wooden Sword');
    expect(host.querySelector('.equipment-durability')!.textContent).toBe('10/10');
    const details = host.querySelector('details')!;
    expect(details.open).toBeFalse();
    host.querySelector('summary')!.click();
    expect(details.open).toBeTrue();
    expect(host.querySelector('.equipment-columns')).not.toBeNull();
  });

  it('emits selection requests without owning the equipped state', () => {
    const { fixture, card, host } = open();
    fixture.componentRef.setInput('selectable', true);
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const change = jasmine.createSpy('selection');
    card.selectionChange.subscribe(change);
    const checkbox = host.querySelector<HTMLInputElement>('input')!;
    expect(checkbox.checked).toBeTrue();
    checkbox.click();
    expect(change).toHaveBeenCalledTimes(1);
    expect(card.selected()).toBeTrue();
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(checkbox.disabled).toBeTrue();
    checkbox.click();
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('does not group unrelated standalone disclosures by default', () => {
    const { host } = open();
    expect(host.querySelector('details')!.hasAttribute('name')).toBeFalse();
  });

  it('only offers upgrade controls on selectable cards with available variants', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('variants', ITEMS);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-upgrade')).toBeNull();
    fixture.componentRef.setInput('selectable', true);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-upgrade')).not.toBeNull();
    fixture.componentRef.setInput('variants', [ITEMS[0]]);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-upgrade')).toBeNull();
  });

  it('renders the upgrade as an inline suffix with an arrow only for the base item', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('variants', ITEMS);
    fixture.componentRef.setInput('selectable', true);
    fixture.detectChanges();
    const select = host.querySelector<HTMLSelectElement>('.equipment-name-text select')!;
    expect(select).not.toBeNull();
    expect(host.querySelector('.equipment-upgrade-wrap--base')).not.toBeNull();
    const upgraded = ITEMS.find((item) => item.Name === 'Wooden Sword+1')!;
    fixture.componentRef.setInput('item', upgraded);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-name-text')!.firstChild!.textContent).toBe('Wooden Sword');
    expect(select.selectedOptions[0].textContent).toBe('+1');
    expect(host.querySelector('.equipment-upgrade-wrap--base')).toBeNull();
    fixture.componentRef.setInput('selectable', false);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-name-text')!.textContent).toBe('Wooden Sword+1');
    expect(host.querySelector('select')).toBeNull();
  });

  it('keeps named Answerer forms unchanged on read-only cards', () => {
    const { fixture, host } = open();
    for (const name of ['Answerer Arisen', 'Answerer Breaker', 'Answerer Huang']) {
      fixture.componentRef.setInput('item', ITEMS.find((item) => item.Name === name)!);
      fixture.componentRef.setInput('variants', ITEMS);
      fixture.detectChanges();
      expect(host.querySelector('.equipment-name-text')!.textContent).toBe(name);
      expect(host.querySelector('select')).toBeNull();
    }
  });

  it('uses the empty effectiveness column to keep short weapon upgrade menus inline on mobile', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('selectable', true);
    fixture.componentRef.setInput('variants', ITEMS);
    host.style.display = 'block';
    document.body.appendChild(host);
    for (const width of [280, 300, 340]) {
      host.style.width = `${width}px`;
      for (const name of ['Wooden Sword', 'Wooden Sword+1']) {
        fixture.componentRef.setInput('item', ITEMS.find((item) => item.Name === name)!);
        fixture.detectChanges();
        const text = host.querySelector('.equipment-name-text')!;
        const range = document.createRange();
        range.selectNode(text.firstChild!);
        const textBox = range.getBoundingClientRect();
        const menu = host.querySelector('.equipment-upgrade')!.getBoundingClientRect();
        expect(menu.top).withContext(`${name} at ${width}px`).toBeLessThan(textBox.bottom);
        expect(menu.bottom).toBeGreaterThan(textBox.top);
        expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      }
    }
    fixture.componentRef.setInput('item', {
      ...ITEMS[0], Name: 'An exceptionally long weapon name that needs multiple lines',
    });
    fixture.detectChanges();
    const name = host.querySelector('.equipment-name-text')!;
    const range = document.createRange();
    range.selectNodeContents(name.firstChild!);
    expect(range.getClientRects().length).toBeGreaterThan(1);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
  });

  it('keeps upgrade controls, effectiveness icons and durability inline while only long names wrap', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('selectable', true);
    host.style.display = 'block';
    document.body.appendChild(host);
    for (const width of [260, 280, 340]) {
      host.style.width = `${width}px`;
      for (const name of ['Wooden Sword', 'An exceptionally long weapon name']) {
        const item = { ...ITEMS[0], Name: name, EffectiveType: ['Armor', 'Flying'] };
        fixture.componentRef.setInput('item', item);
        fixture.componentRef.setInput('variants', [item, { ...item, Name: `${name}+1` }]);
        fixture.detectChanges();
        const menu = host.querySelector('.equipment-upgrade')!.getBoundingClientRect();
        const icons = Array.from(host.querySelectorAll('.effectiveness-badge')).map((el) => el.getBoundingClientRect());
        const durability = host.querySelector('.equipment-durability')!.getBoundingClientRect();
        for (const box of [...icons, durability]) {
          expect(Math.abs((box.top + box.bottom - menu.top - menu.bottom) / 2)).toBeLessThan(2);
        }
        expect(icons[0].top).toBe(icons[1].top);
        expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      }
    }
  });

  it('only shows the description for items without combat details', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('item', vulnerary);
    fixture.detectChanges();
    expect(host.querySelector('.equipment-columns')).toBeNull();
    expect(host.querySelector('.equipment-details')!.textContent!.trim()).toBe('Restores 20 HP');
    expect(host.querySelector('.equipment-durability')!.textContent).toBe('3');
  });

  it('retains combat details for zero stats, healing power, or skill requirements', () => {
    const { fixture, host } = open();
    for (const fields of [{ Mt: 0 }, { Pwr: '10' }, { Skills: [{ SkillType: 'White Magic', SkillRank: 'E' }] }]) {
      fixture.componentRef.setInput('item', { ...vulnerary, ...fields });
      fixture.detectChanges();
      expect(host.querySelector('.equipment-columns')).not.toBeNull();
    }
  });

  it('uses normal and extra effectiveness symbols with full accessible labels', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('item', {
      ...ITEMS[0], EffectiveType: ['Cavalry', 'extraCavalry', 'ExtraFlying', 'ExtraUndead', 'Undead'],
    });
    fixture.detectChanges();
    const badges = Array.from(host.querySelectorAll<HTMLElement>('.effectiveness-badge'));
    expect(badges.map((badge) => badge.querySelector('img')!.getAttribute('src'))).toEqual([
      'icons/effective/effective_cavalry.png', 'icons/effective/extra_effective_cavalry.png',
      'icons/effective/extra_effective_flying.png', 'icons/effective/extra_effective_undead.png',
      'icons/effective/effective_undead.png',
    ]);
    expect(badges.map((badge) => badge.classList.contains('effectiveness-badge--enhanced')))
      .toEqual([false, true, true, true, false]);
    expect(badges.map((badge) => badge.title)).toEqual([
      'Effective Cavalry: 2x weapon Might', 'Effective+ Cavalry: 3x weapon Might',
      'Effective+ Flying: 3x weapon Might', 'Effective+ Undead: 3x weapon Might', 'Effective Undead: 2x weapon Might',
    ]);
    expect(badges.map((badge) => badge.getAttribute('aria-label'))).toEqual(badges.map((badge) => badge.title));
    for (const badge of badges) {
      expect(badge.querySelector('img')!.alt).toBe('');
      expect(getComputedStyle(badge).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(badge.getBoundingClientRect().width).toBeLessThanOrEqual(24);
    }
  });

  it('maps all supplied target symbols and keeps unknown targets readable', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('item', {
      ...ITEMS[0], EffectiveType: ['Armor', 'Beast', 'Dragon', 'Flying', 'Extra Armor', 'Unknown'],
    });
    fixture.detectChanges();
    const badges = Array.from(host.querySelectorAll('.effectiveness-badge'));
    expect(badges.slice(0, 5).map((badge) => badge.querySelector('img')!.getAttribute('src'))).toEqual([
      'icons/effective/effective_armor.png', 'icons/effective/effective_beast.png',
      'icons/effective/effective_dragon.png', 'icons/effective/effective_flying.png',
      'icons/effective/extra_effective_armor.png',
    ]);
    expect(badges[5].textContent!.trim()).toBe('Unknown');
    expect(badges[5].querySelector('img')).toBeNull();
  });

  it('accepts display-form effectiveness labels without adding a second prefix', () => {
    const { fixture, card, host } = open();
    fixture.componentRef.setInput('item', {
      ...ITEMS[0], EffectiveType: ['Effective Cavalry', 'Effective+ Cavalry'],
    });
    fixture.detectChanges();
    expect(card.effectiveness().map((entry) => entry.label)).toEqual(['Effective Cavalry', 'Effective+ Cavalry']);
    fixture.componentRef.setInput('item', ITEMS[0]);
    fixture.detectChanges();
    expect(host.querySelector('.effectiveness')).toBeNull();
  });

  it('shows effectiveness between the name and durability while details are collapsed', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('item', { ...ITEMS[0], EffectiveType: ['Cavalry'] });
    fixture.detectChanges();
    const heading = host.querySelector('.equipment-heading')!;
    expect(Array.from(heading.children).map((child) => child.className)).toEqual([
      'equipment-name', 'effectiveness', 'equipment-durability',
    ]);
    expect(host.querySelector('details')!.open).toBeFalse();
    expect(host.querySelector<HTMLElement>('.effectiveness-badge')!.checkVisibility()).toBeTrue();
    expect(host.querySelector('.equipment-details .effectiveness')).toBeNull();
  });

  it('aligns effectiveness and durability columns across names, upgrades, and badge counts', () => {
    const cards = [
      { ...ITEMS[0], Name: 'Bow', Durability: '5/5', EffectiveType: ['Flying'] },
      { ...ITEMS[0], Name: 'A much longer weapon name', Durability: '100/100', EffectiveType: ['Cavalry', 'Armor'] },
      { ...ITEMS[0], Name: 'No effectiveness', EffectiveType: [] },
    ].map((item) => {
      const fixture = TestBed.createComponent(ItemCardComponent);
      fixture.componentRef.setInput('item', item);
      fixture.componentRef.setInput('variants', [item, { ...item, Name: `${item.Name}+1` }]);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      host.style.display = 'block';
      return { fixture, host };
    });
    for (const { host } of cards) {
      document.body.appendChild(host);
    }

    for (const selectable of [false, true]) {
      for (const width of [280, 480]) {
        for (const { fixture, host } of cards) {
          host.style.width = `${width}px`;
          fixture.componentRef.setInput('selectable', selectable);
          fixture.detectChanges();
        }
        const left = (host: HTMLElement, selector: string) =>
          host.querySelector(selector)!.getBoundingClientRect().left - host.getBoundingClientRect().left;
        const badgePositions = cards.slice(0, 2).map(({ host }) => left(host, '.effectiveness-badge'));
        expect(Math.abs(badgePositions[0] - badgePositions[1])).toBeLessThan(1);
        const durabilityEnds = cards.map(({ host }) =>
          host.querySelector('.equipment-durability')!.getBoundingClientRect().right - host.getBoundingClientRect().left);
        expect(Math.max(...durabilityEnds) - Math.min(...durabilityEnds)).toBeLessThan(1);
        for (const { host } of cards) {
          expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
          const badges = host.querySelectorAll('.effectiveness-badge');
          if (badges.length) {
            const name = host.querySelector('.equipment-name')!.getBoundingClientRect();
            expect(name.right).toBeLessThanOrEqual(badges[0].getBoundingClientRect().left);
          }
        }
      }
    }
  });
});
