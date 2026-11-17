import { TestBed } from '@angular/core/testing';
import { Item, ITEMS } from '../models/equipment';
import { ItemCardComponent } from './item-card.component';

describe('ItemCardComponent', () => {
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

  it('labels normal effectiveness orange and Extra types as red Effective+ badges', () => {
    const { fixture, host } = open();
    fixture.componentRef.setInput('item', {
      ...ITEMS[0], EffectiveType: ['Cavalry', 'extraCavalry', 'ExtraFlying', 'ExtraUndead', 'Undead'],
    });
    fixture.detectChanges();
    const badges = Array.from(host.querySelectorAll<HTMLElement>('.effectiveness-badge'));
    expect(badges.map((badge) => badge.textContent!.trim())).toEqual([
      'Cavalry', 'Cavalry', 'Flying', 'Undead', 'Undead',
    ]);
    expect(badges.map((badge) => badge.classList.contains('effectiveness-badge--enhanced')))
      .toEqual([false, true, true, true, false]);
    expect(badges.map((badge) => badge.title)).toEqual([
      'Effective Cavalry: 2x weapon Might', 'Effective+ Cavalry: 3x weapon Might',
      'Effective+ Flying: 3x weapon Might', 'Effective+ Undead: 3x weapon Might', 'Effective Undead: 2x weapon Might',
    ]);
    expect(badges.map((badge) => badge.getAttribute('aria-label'))).toEqual(badges.map((badge) => badge.title));
    expect(getComputedStyle(badges[0]).backgroundColor).toBe('rgb(255, 186, 115)');
    expect(getComputedStyle(badges[1]).backgroundColor).toBe('rgb(255, 153, 153)');
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
});
