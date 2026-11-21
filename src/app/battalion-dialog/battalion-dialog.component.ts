import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Battalion, BATTALION_RANK_ORDER, BATTALION_TYPE_ORDER, STAT_KEYS, STAT_LABELS } from '../models/growth.models';
import { PickerDialogComponent, PickerGroup } from '../picker-dialog/picker-dialog.component';

@Component({
  selector: 'app-battalion-dialog',
  imports: [PickerDialogComponent],
  template: `
    <app-picker-dialog title="Assign battalion" [eyebrow]="eyebrow()"
      context="Battalion bonuses apply only while the current class is unmounted."
      [tabs]="tabs" allTab="ALL" [groups]="groups()" [selected]="selection()" [max]="1"
      [itemTemplate]="battalionItem" (confirmed)="confirm($event)" (closed)="closed.emit()" />
    <ng-template #battalionItem let-item let-picker="picker">
      <div class="picker-item" [class.picker-item--on]="picker.isPicked(item)" [class.picker-item--disabled]="picker.isDisabled(item)">
        <input type="checkbox" [attr.aria-label]="'Assign ' + item.name" [checked]="picker.isPicked(item)"
          [disabled]="picker.isDisabled(item)" (change)="picker.toggle(item)" />
        <details class="picker-item-details" [attr.name]="picker.disclosureGroup">
          <summary class="picker-item-name">
            <span class="battalion-name">{{ item.name }}</span>
            <span class="picker-item-chevron" aria-hidden="true"></span>
          </summary>
          <div class="equipment-details"><p><strong>Bonus stats</strong> {{ item.description }}</p></div>
        </details>
      </div>
    </ng-template>
  `,
  styleUrls: ['../item-card/item-card.component.scss'],
  styles: ['.battalion-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattalionDialogComponent {
  readonly eyebrow = input('Growth Mapper');
  readonly battalions = input.required<readonly Battalion[]>();
  readonly selected = input<Battalion | null>(null);
  readonly confirmed = output<Battalion | null>();
  readonly closed = output<void>();
  readonly tabs = ['ALL', ...BATTALION_TYPE_ORDER];
  readonly selection = computed(() => this.selected() ? [String(this.selected()!.id)] : []);
  readonly groups = computed<PickerGroup[]>(() => BATTALION_RANK_ORDER.flatMap((rank) => BATTALION_TYPE_ORDER.map((type) => ({
    label: `Rank ${rank} · ${type}`,
    tab: type,
    items: this.battalions().filter((battalion) => battalion.rank === rank && battalion.type === type)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((battalion) => ({
        id: String(battalion.id),
        name: `${battalion.name} · ${battalion.type}`,
        description: STAT_KEYS.filter((stat) => battalion[stat] !== 0)
          .map((stat) => `${STAT_LABELS[stat]} ${battalion[stat] > 0 ? '+' : ''}${battalion[stat]}`).join(', ') || 'No stat bonuses',
        family: 'battalion',
      })),
  }))).filter((group) => group.items.length > 0));

  confirm(ids: string[]): void {
    this.confirmed.emit(this.battalions().find((battalion) => String(battalion.id) === ids[0]) ?? null);
  }
}
