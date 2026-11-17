import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface StatRowItem {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'zero' | 'base';
  wide?: boolean;
  detail?: string;
  boosted?: boolean;
}

@Component({
  selector: 'app-stat-rows',
  template: `
    <ul class="stat-rows" [class.stat-rows--split]="split()" [style.--split-rows]="splitRows()">
      @for (item of items(); track item.label) {
        <li class="stat-row" [class.stat-row--wide]="item.wide" [attr.data-tone]="item.tone" [attr.title]="item.detail ?? null">
          <span class="stat-row-label">{{ item.label }}</span>
          <span class="stat-row-value" [class.stat-bonus]="item.boosted">{{ item.value }}</span>
        </li>
      }
    </ul>
  `,
  styleUrl: './stat-rows.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatRowsComponent {
  readonly items = input.required<readonly StatRowItem[]>();
  readonly split = input(false);
  readonly splitRows = input(4);
}