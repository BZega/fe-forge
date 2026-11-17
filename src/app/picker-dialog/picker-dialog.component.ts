import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, input, OnInit, output, signal, TemplateRef } from '@angular/core';

let nextPickerId = 0;

export interface PickerItem {
  id: string;
  name: string;
  description?: string;
  fixed?: boolean;
  family?: string;
  locked?: string;
  usesWeapon?: boolean;
}

export interface WeaponOption {
  key: string;
  label: string;
}

export interface PickerGroup {
  label: string;
  tab?: string;
  items: readonly PickerItem[];
}

@Component({
  selector: 'app-picker-dialog',
  imports: [NgTemplateOutlet],
  templateUrl: './picker-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PickerDialogComponent implements OnInit {
  readonly disclosureGroup = `picker-details-${nextPickerId++}`;
  readonly title = input.required<string>();
  readonly eyebrow = input('Growth Mapper');
  readonly context = input('');
  readonly groups = input<readonly PickerGroup[]>([]);
  readonly tabs = input<readonly string[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly max = input<number | null>(null);
  readonly weaponOptions = input<readonly WeaponOption[] | null>(null);
  readonly weapon = input<string | null>(null);
  readonly weaponNeeded = input(false);
  readonly itemTemplate = input<TemplateRef<{ $implicit: PickerItem; picker: PickerDialogComponent }> | null>(null);

  readonly confirmed = output<string[]>();
  readonly weaponChosen = output<string | null>();
  readonly closed = output<void>();

  readonly picked = signal<string[]>([]);
  readonly query = signal('');
  readonly activeTab = signal('');
  readonly pickedWeapon = signal<string | null>(null);

  private readonly items = computed(() => this.groups().flatMap((group) => group.items));

  readonly count = computed(() => this.picked().length);
  readonly full = computed(() => {
    const max = this.max();
    return max !== null && this.count() >= max;
  });

  readonly filtered = computed(() => {
    const needle = this.query().trim().toLowerCase();

    return this.groups()
      .filter((group) => this.tabs().length === 0 || group.tab === this.activeTab())
      .map((group) => ({
        label: group.label,
        items: needle ? group.items.filter((item) => item.name.toLowerCase().includes(needle)) : group.items,
      }))
      .filter((group) => group.items.length > 0);
  });

  ngOnInit(): void {
    const fixed = this.items().filter((item) => item.fixed).map((item) => item.id);
    this.picked.set([...new Set([...fixed, ...this.selected()])]);
    this.pickedWeapon.set(this.weapon());
    this.activeTab.set(this.tabs()[0] ?? '');
  }

  onTabKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.indexOf(this.activeTab());
    let next: number;

    switch (event.key) {
      case 'ArrowRight': next = (current + 1) % tabs.length; break;
      case 'ArrowLeft': next = (current - 1 + tabs.length) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }

    event.preventDefault();
    this.activeTab.set(tabs[next]);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
    }
  }

  readonly showWeapon = computed(
    () =>
      this.weaponOptions() !== null &&
      (this.weaponNeeded() || this.items().some((item) => item.usesWeapon && this.isPicked(item))),
  );

  isPicked(item: PickerItem): boolean {
    return this.picked().includes(item.id);
  }

  isDisabled(item: PickerItem): boolean {
    if (item.fixed || (item.locked && !this.isPicked(item))) {
      return true;
    }

    return !this.isPicked(item) && this.full() && !this.familyMember(item);
  }

  toggle(item: PickerItem): void {
    if (this.isDisabled(item)) {
      return;
    }

    if (this.isPicked(item)) {
      this.picked.update((ids) => ids.filter((id) => id !== item.id));
      return;
    }

    const swapped = this.familyMember(item);

    this.picked.update((ids) =>
      swapped ? ids.map((id) => (id === swapped ? item.id : id)) : [...ids, item.id],
    );
  }

  private familyMember(item: PickerItem): string | null {
    if (!item.family) {
      return null;
    }

    return (
      this.items().find(
        (other) => other.id !== item.id && other.family === item.family && this.isPicked(other),
      )?.id ?? null
    );
  }

  confirm(): void {
    if (this.weaponOptions() !== null) {
      this.weaponChosen.emit(this.pickedWeapon());
    }

    this.confirmed.emit(this.picked());
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
