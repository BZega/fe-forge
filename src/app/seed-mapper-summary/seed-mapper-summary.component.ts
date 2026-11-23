import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { GrowthRates, STAT_KEYS, STAT_LABELS, StatKey } from '../models/growth.models';
import type { SummaryProfile } from '../seed-mapper-page/seed-mapper-page.component';

export interface SummaryTotal {
  value: number | null;
  title: string;
  boosted: boolean;
}

@Component({
  selector: 'app-seed-mapper-summary',
  imports: [NgTemplateOutlet],
  templateUrl: './seed-mapper-summary.component.html',
  styleUrl: './seed-mapper-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeedMapperSummaryComponent {
  readonly profile = input.required<SummaryProfile>();
  readonly growth = input.required<GrowthRates | null>();
  readonly growthDetails = input.required<Record<StatKey, { boosted: boolean; title: string }>>();
  readonly totals = input.required<SummaryTotal[]>();
  readonly level = input.required<number>();
  readonly maxLevel = input.required<number>();
  readonly equipment = input.required<{ name: string; slot: string; shortSlot: string; bonus: string }[]>();
  readonly abilities = input.required<{ name: string; detail: string; inactive: boolean; passive: boolean }[]>();
  readonly showsGrowth = model.required<boolean>();
  readonly statKeys = STAT_KEYS;
  readonly summaryStatKeys = STAT_KEYS.slice(1);
  readonly statLabels = STAT_LABELS;
}
