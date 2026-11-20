import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChildren } from '@angular/core';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { ItemCardComponent } from '../item-card/item-card.component';
import { Item, ITEMS, itemBaseName, itemVariants } from '../models/equipment';

const TYPE_ORDER = ['Sword', 'Spear', 'Axe', 'Bow', 'Gauntlets', 'Black Magic', 'White Magic', 'Shield', 'Mask', 'Staff', 'Accessory'];

@Component({
  selector: 'app-weapons-page',
  imports: [HelpDialogComponent, ItemCardComponent],
  templateUrl: './weapons-page.component.html',
  styleUrls: ['../styles/browse-page.scss', './weapons-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeaponsPageComponent {
  readonly items = input<readonly Item[]>(ITEMS);
  readonly search = signal('');
  readonly selectedType = signal('');
  private readonly chosenVariants = signal<ReadonlyMap<string, string>>(new Map());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cards = viewChildren(ItemCardComponent, { read: ElementRef<HTMLElement> });

  constructor() {
    afterRenderEffect((onCleanup) => {
      const contents = this.cards().map((card) => card.nativeElement.firstElementChild).filter(
        (content): content is HTMLElement => content instanceof HTMLElement,
      );
      const measure = () => {
        this.host.nativeElement.style.removeProperty('--catalog-detail-row-height');
        const rows = contents.flatMap((content) => Array.from(content.querySelectorAll<HTMLElement>('.equipment-columns dl > div')));
        const rowHeight = Math.ceil(Math.max(0, ...rows.map((row) => row.getBoundingClientRect().height)));
        this.host.nativeElement.style.setProperty('--catalog-detail-row-height', `${rowHeight}px`);
        this.host.nativeElement.style.setProperty('--catalog-card-height', 'auto');
        const height = Math.ceil(Math.max(0, ...contents.map((content) => content.getBoundingClientRect().height)));
        this.host.nativeElement.style.setProperty('--catalog-card-height', `${height + 2}px`);
      };
      const observer = new ResizeObserver(measure);
      contents.forEach((content) => content.querySelectorAll('.picker-item-name, .picker-item-description, .equipment-columns')
        .forEach((element) => observer.observe(element)));
      measure();
      onCleanup(() => observer.disconnect());
    });
  }

  private familyKey(item: Item): string {
    return JSON.stringify([item.WeaponType, itemBaseName(item.Name)]);
  }

  changeVariant(item: Item, name: string): void {
    this.chosenVariants.update((chosen) => new Map(chosen).set(this.familyKey(item), name));
  }

  private readonly families = computed(() => {
    const seen = new Set<string>();
    return this.items().filter((item) => {
      const key = this.familyKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({ key: this.familyKey(item), type: item.WeaponType, variants: itemVariants(item, this.items()) }));
  });
  readonly helpText = [
    'Browse weapons, magic and equipment. Filter by type or search by name, type or description.',
    'Details are always visible. Use each item’s version dropdown to compare upgrades and named forms, including combat values, skill requirements and effectiveness.',
    'Equipment types, including Shields, Masks, Staffs and Accessories, appear automatically when items of those types are added to the catalog.',
  ];

  readonly types = computed(() => [...new Set(this.items().map((item) => item.WeaponType))].sort((a, b) => {
    const first = TYPE_ORDER.indexOf(a);
    const second = TYPE_ORDER.indexOf(b);
    return (first < 0 ? TYPE_ORDER.length : first) - (second < 0 ? TYPE_ORDER.length : second) || a.localeCompare(b);
  }));

  readonly groups = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.types()
      .filter((type) => !this.selectedType() || type === this.selectedType())
      .map((type) => ({
        type,
        items: this.families().filter((family) => family.type === type).flatMap((family) => {
          const matches = family.variants.filter((item) =>
            !query || `${item.Name} ${item.WeaponType} ${item.Description}`.toLowerCase().includes(query));
          if (!matches.length) return [];
          const chosen = this.chosenVariants().get(family.key);
          const item = family.variants.find((item) => item.Name === chosen) ?? matches[0];
          return [{ ...family, item }];
        }),
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly resultCount = computed(() => this.groups().reduce((count, group) => count + group.items.length, 0));
}
