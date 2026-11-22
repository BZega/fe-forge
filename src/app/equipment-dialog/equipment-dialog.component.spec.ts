import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ITEMS } from '../models/equipment';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { EquipmentDialogComponent } from './equipment-dialog.component';
import { ItemCardComponent } from '../item-card/item-card.component';
import { skillIconUrl } from '../icon-links';

describe('EquipmentDialogComponent', () => {
  const open = (selected: string[] = []) => {
    const fixture = TestBed.createComponent(EquipmentDialogComponent);
    const types = ['Sword', 'Axe', 'Shield', 'Shield', 'Mask', 'Staff', 'Accessory', 'Spear', 'Bow', 'Gauntlet'];
    fixture.componentRef.setInput('items', types.map((WeaponType, index) => ({
      ...ITEMS[0], WeaponType, Name: `Item ${index}`,
    })));
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(PickerDialogComponent)).componentInstance as PickerDialogComponent;
    const item = (name: string) => picker.groups().flatMap((group) => group.items).find((item) => item.name === name)!;
    return { fixture, dialog: fixture.componentInstance, picker, item };
  };

  it('replaces items in the same slot even when all five slots are full', () => {
    const { picker, item } = open(['Item 0', 'Item 2', 'Item 4', 'Item 5', 'Item 6']);
    expect(picker.full()).toBeTrue();
    picker.toggle(item('Item 1'));
    picker.toggle(item('Item 3'));
    expect(picker.picked()).toEqual(['Item 1', 'Item 3', 'Item 4', 'Item 5', 'Item 6']);
    picker.toggle(item('Item 1'));
    expect(picker.picked()).toEqual(['Item 3', 'Item 4', 'Item 5', 'Item 6']);
  });

  it('applies the draft only on confirm and cancels without applying', () => {
    const { dialog, picker, item } = open(['Item 0']);
    const confirmed = jasmine.createSpy('confirmed');
    const closed = jasmine.createSpy('closed');
    dialog.confirmed.subscribe(confirmed);
    dialog.closed.subscribe(closed);
    picker.toggle(item('Item 1'));
    expect(confirmed).not.toHaveBeenCalled();
    picker.close();
    expect(closed).toHaveBeenCalled();
    expect(confirmed).not.toHaveBeenCalled();
    picker.confirm();
    expect(confirmed).toHaveBeenCalledWith(['Item 1']);
  });

  it('searches and restores the equipped item selection', () => {
    const { picker } = open(['Item 0']);
    expect(picker.picked()).toEqual(['Item 0']);
    picker.activeTab.set('Equipment');
    picker.query.set('Item 6');
    expect(picker.filtered().flatMap((group) => group.items).map((item) => item.name)).toEqual(['Item 6']);
  });

  it('restores an equipped mount charm and switches it within the amulet family', () => {
    const fixture = TestBed.createComponent(EquipmentDialogComponent);
    fixture.componentRef.setInput('items', ITEMS.filter((item) => item.Name.startsWith('Swift-Horse ')));
    fixture.componentRef.setInput('selected', ['Swift-Horse Charm']);
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(PickerDialogComponent)).componentInstance as PickerDialogComponent;
    expect(picker.picked()).toEqual(['Swift-Horse Charm']);
    expect(picker.groups().flatMap((group) => group.items).map((item) => item.name)).toEqual(['Swift-Horse Charm']);
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    expect(select.value).toBe('Swift-Horse Charm');
    select.value = 'Swift-Horse Amulet+3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Swift-Horse Amulet+3']);
    expect(select.value).toBe('Swift-Horse Amulet+3');
  });

  it('separates weapon types into tabs and groups equipment on its own tab', () => {
    const { fixture, picker } = open();
    const host = fixture.nativeElement as HTMLElement;
    expect(Array.from(host.querySelectorAll('[role="tab"]')).map((tab) => tab.getAttribute('aria-label')))
      .toEqual(['ALL', 'Sword', 'Spear', 'Axe', 'Bow', 'Gauntlets', 'Equipment']);
    expect(picker.activeTab()).toBe('ALL');
    expect(host.querySelector('.picker-category')).toBeNull();
    picker.activeTab.set('Sword');
    fixture.detectChanges();
    expect(host.querySelector('[role="tab"][aria-label="Sword"] img')!.getAttribute('src')).toBe(skillIconUrl('sword', 'good'));
    expect(host.querySelector('[role="tab"][aria-label="Equipment"] img')!.getAttribute('src')).toBe('icons/equipment/shield.png');
    expect(host.querySelector('[role="tab"][aria-label="Sword"]')!.textContent!.trim()).toBe('');
    expect(host.querySelector('.picker-category')!.textContent).toBe('Sword');
    const names = () => picker.filtered().flatMap((group) => group.items).map((item) => item.name);
    for (const [tab, expected] of [['Sword', 'Item 0'], ['Spear', 'Item 7'], ['Axe', 'Item 1'], ['Bow', 'Item 8'], ['Gauntlets', 'Item 9']]) {
      picker.activeTab.set(tab);
      expect(names()).toEqual([expected]);
    }
    picker.activeTab.set('Equipment');
    fixture.detectChanges();
    expect(host.querySelector('.picker-category')!.textContent).toBe('Equipment');
    expect(picker.filtered().map((group) => group.label)).toEqual(['Shield', 'Mask', 'Staff', 'Accessory']);
    expect(names()).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6']);
  });

  it('keeps equipment selected across tabs while replacing the single weapon across weapon tabs', () => {
    const { fixture, picker } = open(['Item 0', 'Item 2']);
    const host = fixture.nativeElement as HTMLElement;
    const switchTab = (name: string) => {
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((tab) => tab.getAttribute('aria-label') === name)!.click();
      fixture.detectChanges();
    };
    switchTab('Axe');
    host.querySelector<HTMLInputElement>('.picker-item input')!.click();
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Item 1', 'Item 2']);
    switchTab('Sword');
    expect(host.querySelector<HTMLInputElement>('.picker-item input')!.checked).toBeFalse();
    switchTab('Equipment');
    expect(host.querySelector<HTMLInputElement>('.picker-item input')!.checked).toBeTrue();
    expect(picker.count()).toBe(2);
  });

  it('supports keyboard navigation between tabs', () => {
    const { fixture, picker } = open();
    const host = fixture.nativeElement as HTMLElement;
    const press = (key: string) => {
      host.querySelector('[role="tablist"]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
    };
    press('End');
    expect(picker.activeTab()).toBe('Equipment');
    expect(host.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute('aria-label')).toBe('Equipment');
    press('ArrowRight');
    expect(picker.activeTab()).toBe('ALL');
    press('ArrowLeft');
    expect(picker.activeTab()).toBe('Equipment');
    press('Home');
    expect(picker.activeTab()).toBe('ALL');
  });

  it('fits all nine catalog tabs on one line at narrow mobile dialog widths', () => {
    const { fixture } = open();
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector<HTMLElement>('.dialog')!;
    const tablist = host.querySelector<HTMLElement>('[role="tablist"]')!;
    const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs.length).toBe(9);
    for (const width of [270, 340, 520]) {
      dialog.style.width = `${width}px`;
      dialog.style.boxSizing = 'border-box';
      const bounds = tabs.map((tab) => tab.getBoundingClientRect());
      expect(new Set(bounds.map((box) => Math.round(box.top))).size).withContext(`width ${width}`).toBe(1);
      expect(tablist.scrollWidth).withContext(`width ${width}`).toBeLessThanOrEqual(tablist.clientWidth);
      for (const img of Array.from(tablist.querySelectorAll('img'))) {
        expect(img.getBoundingClientRect().width).toBeLessThanOrEqual(20);
        expect(img.getBoundingClientRect().height).toBe(20);
      }
    }
  });

  it('shows every item exactly once in ALL and searches across categories while preserving selection', () => {
    const { fixture, picker, item } = open(['Item 0', 'Item 2']);
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[role="tab"][aria-label="ALL"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.picker-category')).toBeNull();
    expect(Array.from(host.querySelectorAll('.picker-group')).map((header) => header.textContent!.trim()))
      .toEqual(['Sword', 'Spear', 'Axe', 'Bow', 'Gauntlets', 'Shield', 'Mask', 'Staff', 'Accessory']);
    const names = () => picker.filtered().flatMap((group) => group.items.map((entry) => entry.name));
    expect(names().length).toBe(10);
    expect(new Set(names()).size).toBe(10);
    picker.toggle(item('Item 1'));
    expect(picker.picked()).toEqual(['Item 1', 'Item 2']);
    picker.query.set('Item 6');
    expect(names()).toEqual(['Item 6']);
    picker.query.set('');
    expect(names().length).toBe(10);
  });

  it('uses linked icons for both magic types and falls back to local skill icons on image errors', () => {
    const { fixture, dialog } = open();
    fixture.componentRef.setInput('items', ['Black Magic', 'White Magic'].map((WeaponType) => ({
      ...ITEMS[0], WeaponType, Name: WeaponType,
    })));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    for (const [tab, key] of [['Black Magic', 'blackMagic'], ['White Magic', 'whiteMagic']] as const) {
      expect(host.querySelector(`[role="tab"][aria-label="${tab}"] img`)!.getAttribute('src')).toBe(skillIconUrl(key));
    }
    const icon = host.querySelector<HTMLImageElement>('[role="tab"][aria-label="Equipment"] img')!;
    icon.dispatchEvent(new Event('error'));
    expect(icon.getAttribute('src')).toBe(dialog.fallbackIcon('heavyArmor'));
  });

  it('shows an explicit empty state for categories without items', () => {
    const { fixture, picker } = open();
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();
    picker.activeTab.set('Equipment');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.hint')!.textContent).toContain('No items in this category yet.');
  });

  it('collapses item details by default and expands them without equipping', () => {
    const { fixture, picker } = open();
    const host = fixture.nativeElement as HTMLElement;
    const details = host.querySelector<HTMLDetailsElement>('.picker-item details')!;
    const description = details.querySelector<HTMLElement>('.picker-item-description')!;

    expect(details.open).toBeFalse();
    expect(description.checkVisibility()).toBeFalse();
    details.querySelector('summary')!.click();
    fixture.detectChanges();

    expect(details.open).toBeTrue();
    expect(description.checkVisibility()).toBeTrue();
    expect(description.textContent).toBe(ITEMS[0].Description);
    expect(picker.picked()).toEqual([]);

    details.querySelector('summary')!.click();
    fixture.detectChanges();
    expect(details.open).toBeFalse();
    expect(description.checkVisibility()).toBeFalse();
  });

  it('equips items independently of expanding their details', () => {
    const { fixture, picker } = open();
    const host = fixture.nativeElement as HTMLElement;
    const checkbox = host.querySelector<HTMLInputElement>('.picker-item input')!;
    const details = host.querySelector<HTMLDetailsElement>('.picker-item details')!;

    expect(checkbox.getAttribute('aria-label')).toBe('Equip Item 0');
    checkbox.click();
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Item 0']);
    expect(details.open).toBeFalse();

    picker.activeTab.set('Equipment');
    fixture.detectChanges();
    const equipmentDetails = host.querySelector<HTMLDetailsElement>('.picker-item details')!;
    expect(equipmentDetails.open).toBeFalse();
    equipmentDetails.querySelector('summary')!.click();
    fixture.detectChanges();
    expect(equipmentDetails.open).toBeTrue();
    expect(picker.picked()).toEqual(['Item 0']);
  });

  it('aligns the checkbox and item name with the disclosure arrow at the right edge', () => {
    const { fixture, picker } = open();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector<HTMLElement>('.picker-item')!;
    const checkbox = row.querySelector<HTMLInputElement>('input')!;
    const name = row.querySelector<HTMLElement>('summary span')!;
    const arrow = row.querySelector<HTMLElement>('.picker-item-chevron')!;
    const checkBox = checkbox.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const arrowBox = arrow.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();

    expect(nameBox.left).toBeGreaterThan(checkBox.right);
    expect(Math.abs((checkBox.top + checkBox.bottom - nameBox.top - nameBox.bottom) / 2)).toBeLessThan(2);
    expect(arrowBox.left).toBeGreaterThan(nameBox.right);
    expect(rowBox.right - arrowBox.right).toBeLessThan(24);

    arrow.click();
    fixture.detectChanges();
    expect(row.querySelector<HTMLDetailsElement>('details')!.open).toBeTrue();
    expect(picker.picked()).toEqual([]);
  });

  it('shows the weapon icon beside its name and formats combat values in two columns', () => {
    const { fixture } = open();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector<HTMLElement>('.picker-item')!;
    const heading = row.querySelector<HTMLElement>('summary')!;
    const icon = heading.querySelector<HTMLImageElement>('.equipment-icon')!;
    expect(icon.alt).toBe('Sword');
    expect(icon.getAttribute('src')).toBeTruthy();
    expect(heading.querySelector('.equipment-name-text')!.textContent).toBe('Item 0');
    heading.click();
    fixture.detectChanges();

    expect(row.querySelector('.picker-item-description')!.textContent).toBe(ITEMS[0].Description);
    const columns = row.querySelectorAll('.equipment-columns dl');
    const terms = (column: Element) => Array.from(column.querySelectorAll('dt')).map((term) => term.textContent);
    const values = (column: Element) => Array.from(column.querySelectorAll('dd')).map((value) => value.textContent!.trim());
    expect(terms(columns[0])).toEqual(['Mt', 'Hit', 'Crit', 'Curse']);
    expect(values(columns[0])).toEqual(['2', '90', '0', '--']);
    expect(terms(columns[1])).toEqual(['Wt', 'Avo', 'Rng', 'Skill']);
    expect(values(columns[1])).toEqual(['2', '0', '1', 'E']);
    expect(columns[1].querySelector<HTMLImageElement>('.equipment-skill img')!.alt).toBe('Sword');

    const left = columns[0].getBoundingClientRect();
    const right = columns[1].getBoundingClientRect();
    expect(right.left).toBeGreaterThan(left.right);
    expect(Math.abs(right.top - left.top)).toBeLessThan(1);
  });

  it('groups upgrades into one card, restores a saved upgrade and confirms the chosen variant', () => {
    const fixture = TestBed.createComponent(EquipmentDialogComponent);
    fixture.componentRef.setInput('items', ITEMS.filter((item) => item.Name === 'Wooden Sword' || /^Wooden Sword\+[0-9]$/.test(item.Name)));
    fixture.componentRef.setInput('selected', ['Wooden Sword+1']);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const picker = fixture.debugElement.query(By.directive(PickerDialogComponent)).componentInstance as PickerDialogComponent;
    const confirmed = jasmine.createSpy('confirmed');
    fixture.componentInstance.confirmed.subscribe(confirmed);
    expect(host.querySelectorAll('app-item-card').length).toBe(1);
    expect(host.querySelector('.equipment-name-text')!.firstChild!.textContent).toBe('Wooden Sword');
    expect(host.querySelector('.equipment-columns dd')!.textContent).toBe('3');
    const select = host.querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    expect(Array.from(select.options).map((option) => option.textContent))
      .toEqual(fixture.componentInstance.items().map((item) => item.Name === 'Wooden Sword' ? '' : '+' + item.Name.slice(-1)));
    expect(select.value).toBe('Wooden Sword+1');
    select.click();
    expect(host.querySelector('details')!.open).toBeFalse();
    select.value = 'Wooden Sword';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Wooden Sword']);
    expect(host.querySelector('.equipment-name-text')!.firstChild!.textContent).toBe('Wooden Sword');
    expect(host.querySelector('.equipment-columns dd')!.textContent).toBe('2');
    picker.confirm();
    expect(confirmed).toHaveBeenCalledWith(['Wooden Sword']);
  });

  it('groups Answerer forms after numeric upgrades and restores and equips named forms', () => {
    const fixture = TestBed.createComponent(EquipmentDialogComponent);
    fixture.componentRef.setInput('items', ITEMS.filter((item) => item.Name.startsWith('Answerer')).reverse());
    fixture.componentRef.setInput('selected', ['Answerer Breaker']);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const picker = fixture.debugElement.query(By.directive(PickerDialogComponent)).componentInstance as PickerDialogComponent;
    expect(host.querySelectorAll('app-item-card').length).toBe(1);
    const select = host.querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    expect(Array.from(select.options).map((option) => option.textContent))
      .toEqual(['', '+1', '+2', '+3', 'Arisen', 'Breaker', 'Huang']);
    expect(select.value).toBe('Answerer Breaker');
    expect(select.getBoundingClientRect().width).toBeGreaterThan(40);
    expect(host.querySelector('.equipment-columns dd')!.textContent).toBe('18');
    select.value = 'Answerer+3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Answerer+3']);
    const updatedSelect = host.querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    updatedSelect.value = 'Answerer Huang';
    updatedSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Answerer Huang']);
    expect(host.querySelector('.equipment-columns dd')!.textContent).toBe('21');
    const confirmed = jasmine.createSpy('confirmed');
    fixture.componentInstance.confirmed.subscribe(confirmed);
    picker.confirm();
    expect(confirmed).toHaveBeenCalledWith(['Answerer Huang']);
  });

  it('can preview an upgrade without equipping it or applying a cancelled draft', () => {
    const fixture = TestBed.createComponent(EquipmentDialogComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const picker = fixture.debugElement.query(By.directive(PickerDialogComponent)).componentInstance as PickerDialogComponent;
    const select = host.querySelector<HTMLSelectElement>('.equipment-upgrade')!;
    select.value = 'Wooden Sword+1';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(picker.picked()).toEqual([]);
    host.querySelector<HTMLInputElement>('app-item-card input')!.click();
    fixture.detectChanges();
    expect(picker.picked()).toEqual(['Wooden Sword+1']);
    expect(fixture.componentInstance.selected()).toEqual([]);
  });

  it('supports multiple skill requirements, missing skill icons, and equipment without requirements', () => {
    const { fixture, picker } = open();
    fixture.componentRef.setInput('items', [{
      ...ITEMS[0], WeaponType: 'Gauntlets',
      Skills: [{ SkillType: 'Gauntlets', SkillRank: 'D' }, { SkillType: 'Unknown', SkillRank: 'C' }],
    }, { ...ITEMS[0], Name: 'Shield', WeaponType: 'Shield', Skills: [], BonusStats: [{ Def: 2 }] }]);
    picker.activeTab.set('Gauntlets');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const card = fixture.debugElement.query(By.directive(ItemCardComponent)).componentInstance as ItemCardComponent;
    expect(card.skillKey('Gauntlets')).toBe('gauntlet');
    expect(card.skillKey('Black Magic')).toBe('blackMagic');
    expect(card.skillKey('Shield')).toBeNull();
    expect(host.querySelector<HTMLImageElement>('summary img')!.alt).toBe('Gauntlets');
    expect(Array.from(host.querySelectorAll('.equipment-skill')).map((skill) =>
      Array.from(skill.querySelectorAll('span')).map((part) => part.textContent!.trim()).join(' '),
    ))
      .toEqual(['D', 'Unknown C']);
    picker.activeTab.set('Equipment');
    fixture.detectChanges();
    expect(host.querySelector('summary img')!.getAttribute('src')).toBe('icons/equipment/shield.png');
    expect(host.querySelector('.equipment-skills')!.textContent!.trim()).toBe('--');
    expect(host.textContent).toContain('Def +2');
  });

  it('only opens one item description at a time without changing equipped items', () => {
    const { fixture, picker } = open(['Item 0']);
    picker.activeTab.set('Equipment');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const details = Array.from(host.querySelectorAll<HTMLDetailsElement>('.picker-item details'));
    details[0].querySelector('summary')!.click();
    expect(details[0].open).toBeTrue();

    details[1].querySelector('summary')!.click();
    expect(details[0].open).toBeFalse();
    expect(details[1].open).toBeTrue();
    expect(details.filter((item) => item.open).length).toBe(1);
    expect(picker.picked()).toEqual(['Item 0']);

    details[1].querySelector('summary')!.click();
    expect(details.every((item) => !item.open)).toBeTrue();
  });

  it('keeps durability visible beside the arrow on the name row when collapsed', () => {
    const { fixture } = open();
    const host = fixture.nativeElement as HTMLElement;
    const row = host.querySelector<HTMLElement>('.picker-item')!;
    const details = row.querySelector<HTMLDetailsElement>('details')!;
    const durability = row.querySelector<HTMLElement>('summary .equipment-durability')!;
    const name = row.querySelector<HTMLElement>('.equipment-name')!;
    const arrow = row.querySelector<HTMLElement>('.picker-item-chevron')!;

    expect(details.open).toBeFalse();
    expect(durability.checkVisibility()).toBeTrue();
    expect(durability.textContent).toBe('10/10');
    expect(durability.getAttribute('aria-label')).toBe('Durability 10/10');
    const durabilityBox = durability.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const arrowBox = arrow.getBoundingClientRect();
    expect(durabilityBox.left).toBeGreaterThan(nameBox.right);
    expect(arrowBox.left).toBeGreaterThan(durabilityBox.right);
    expect(arrowBox.left - durabilityBox.right).toBeLessThan(32);
    expect(Math.abs((durabilityBox.top + durabilityBox.bottom - nameBox.top - nameBox.bottom) / 2)).toBeLessThan(2);
    expect(row.querySelector('.equipment-details .equipment-durability')).toBeNull();
  });
});
