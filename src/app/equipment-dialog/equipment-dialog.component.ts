import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { EQUIPMENT_SLOTS, equippedItems, equipmentSlot, ITEMS, Item, itemBaseName, itemVariants } from '../models/equipment';
import { PickerDialogComponent, PickerGroup } from '../picker-dialog/picker-dialog.component';
import { ItemCardComponent } from '../item-card/item-card.component';

const WEAPON_TABS = ['Sword', 'Spear', 'Axe', 'Bow', 'Gauntlets'];

function weaponTab(item: Item): string {
  const type = item.WeaponType.toLowerCase();
  return WEAPON_TABS.find((tab) => tab.toLowerCase() === type || (tab === 'Gauntlets' && type === 'gauntlet')) ?? item.WeaponType;
}

@Component({
  selector: 'app-equipment-dialog',
  imports: [ItemCardComponent, PickerDialogComponent],
  templateUrl: './equipment-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentDialogComponent {
  readonly eyebrow = input('Growth Mapper');
  readonly selected = input<readonly string[]>([]);
  readonly items = input<readonly Item[]>(ITEMS);
  readonly confirmed = output<string[]>();
  readonly closed = output<void>();
  readonly byName = computed(() => new Map(this.items().map((item) => [item.Name, item])));
  private readonly chosenVariants = signal<ReadonlyMap<string, string>>(new Map());
  readonly itemVariants = itemVariants;
  private readonly displayItems = computed(() => {
    const seen = new Set<string>();
    return this.items().filter((item) => {
      const base = itemBaseName(item.Name);
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    }).map((item) => {
      const variants = itemVariants(item, this.items());
      const base = itemBaseName(item.Name);
      const name = this.chosenVariants().get(base) ??
        this.selection().find((name) => variants.some((variant) => variant.Name === name));
      return variants.find((variant) => variant.Name === name) ?? variants[0];
    });
  });

  changeVariant(item: Item, name: string, picker: PickerDialogComponent): void {
    this.chosenVariants.update((current) => new Map(current).set(itemBaseName(item.Name), name));
    picker.picked.update((names) => names.map((current) => current === item.Name ? name : current));
  }

  readonly selection = computed(() => equippedItems(this.selected(), this.items()).map((item) => item.Name));
  readonly tabs = computed(() => [
    ...new Set([...WEAPON_TABS, ...this.items().filter((item) => equipmentSlot(item) === 'Weapon').map(weaponTab)]),
    'Equipment',
  ]);
  readonly groups = computed<PickerGroup[]>(() => [
    ...this.tabs().filter((tab) => tab !== 'Equipment').map((tab) => ({
      label: tab,
      tab,
      items: this.displayItems().filter((item) => equipmentSlot(item) === 'Weapon' && weaponTab(item) === tab),
    })),
    ...EQUIPMENT_SLOTS.filter((slot) => slot !== 'Weapon').map((slot) => ({
      label: slot,
      tab: 'Equipment',
      items: this.displayItems().filter((item) => equipmentSlot(item) === slot),
    })),
  ].map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      id: item.Name,
      name: item.Name,
      description: item.Description,
      family: equipmentSlot(item),
    })),
  })));
}
