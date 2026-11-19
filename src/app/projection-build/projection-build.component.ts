import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MAX_PROJECTION_LEVEL } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityPickerGroups, Battalion, BATTALION_TYPE_ORDER, classLabel, GrowthRates, MAX_EQUIPPED_ABILITIES, STAT_KEYS, STAT_LABELS, StatBoostAbility, StatKey, toGrowth } from '../models/growth.models';
import { abilitiesAt, abilityLock, InGameGear, inGameBonus, isMountedClass, usesWeapon } from '../models/bonuses';
import { levelUpGrowth, routeLabel, stepAtLevel } from '../models/recruitment.models';
import { DistributionSummary, projectDistributions, quantile, rankOf, Ranking, shift, StatDistribution, summarize } from '../models/stat-distribution';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { DEFAULT_PROJECTION_OPTIONS, ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { StatHistogramComponent } from '../stat-histogram/stat-histogram.component';
import { EquipmentDialogComponent } from '../equipment-dialog/equipment-dialog.component';
import { equipmentWeapon } from '../models/equipment';
import { hasStatBonus, statBreakdown } from '../models/stat-display';
import { BoosterCounts, BoosterEntry, boosterStats } from '../models/stat-boosters';
import { StatBoosterDialogComponent } from '../stat-booster-dialog/stat-booster-dialog.component';

export interface BuildResult {
  label: string;
  level: number;
  totals: Record<StatKey, StatDistribution>;
}

type StatInputs = Record<StatKey, number | null>;

export interface StatRow {
  stat: StatKey;
  label: string;
  distribution: StatDistribution;
  summary: DistributionSummary;
  boosted: boolean;
  detail: string;
  growthRate: number | null;
  actual: number | null;
  rank: Ranking | null;
  verdict: string | null;
  tone: 'low' | 'typical' | 'high' | 'impossible' | null;
  bar: { wideFrom: number; wideTo: number; from: number; to: number; mean: number; actual: number | null };
}

const emptyStats = (): StatInputs => Object.fromEntries(STAT_KEYS.map((stat) => [stat, null])) as StatInputs;

const NO_ABILITIES: readonly StatBoostAbility[] = [];
const NO_EQUIPMENT: readonly string[] = [];

@Component({
  selector: 'app-projection-build',
  imports: [EquipmentDialogComponent, PickerDialogComponent, StatHistogramComponent, StatBoosterDialogComponent],
  templateUrl: './projection-build.component.html',
  styleUrl: './projection-build.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionBuildComponent {
  readonly heading = input.required<string>();
  readonly start = input<ProjectionStart | null>(null);

  readonly options = computed(() => this.start()?.options ?? DEFAULT_PROJECTION_OPTIONS);

  readonly editRequested = output<void>();
  readonly removeRequested = output<void>();
  readonly resultChange = output<BuildResult | null>();
  readonly levelChange = output<number>();
  readonly boostersChange = output<BoosterCounts>();
  readonly boosterPickerOpen = signal(false);
  readonly boosterEntries = computed<BoosterEntry[]>(() => [{
    key: null, label: this.start()?.actual ? `Used by Lv ${this.start()!.actual!.level}` : `Used by Lv ${this.start()?.level ?? 1}`,
    counts: this.start()?.boosters ?? {},
  }]);
  readonly boosterContext = computed(() => this.start()?.actual || (this.start()?.source === 'manual' && !this.start()?.baseStats)
    ? 'Record boosters already included in your entered stats. They are not added to those stats again.'
    : 'Boosters are added to the app-provided base stats before projecting level ups.');
  onBoostersConfirmed(entries: BoosterEntry[]): void {
    this.boostersChange.emit(entries[0].counts);
    this.boosterPickerOpen.set(false);
  }

  readonly maxLevel = MAX_PROJECTION_LEVEL;

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly placeholderBars = Array.from({ length: 17 }, (_, index) => Math.round(100 * Math.exp(-(((index - 8) / 3.2) ** 2) / 2)));

  readonly histogramStat = signal<StatKey>('str');

  readonly view = signal<'base' | 'inGame'>('inGame');

  private readonly api = inject(GrowthDataService);
  private readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), { initialValue: [] as StatBoostAbility[] });

  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  readonly abilityOptions = computed(() => abilitiesFor(this.statBoostAbilities(), this.start()?.name ?? null));
  readonly abilityGroups = computed(() => abilityPickerGroups(this.abilityOptions(), (ability) => abilityLock(ability, this.level())));
  private readonly startAbilities = computed(() => this.start()?.abilities ?? NO_ABILITIES);
  private readonly startEquipment = computed(() => this.start()?.equipment ?? NO_EQUIPMENT);
  private readonly startBattalion = computed(() => this.start()?.battalion ?? null);
  private readonly abilityNames = linkedSignal<readonly StatBoostAbility[], readonly string[]>({
    source: this.startAbilities,
    computation: (abilities) => abilities.map((ability) => ability.name),
  });
  readonly weapon = computed(() => equipmentWeapon(this.equipment()));
  readonly battalion = linkedSignal<Battalion | null, Battalion | null>({ source: this.startBattalion, computation: (battalion) => battalion });
  readonly personalWeapon = computed(() => usesWeapon(this.start()?.name ?? '', this.level(), []));
  readonly abilityPickerOpen = signal(false);
  readonly equipmentPickerOpen = signal(false);
  readonly equipment = linkedSignal<readonly string[], readonly string[]>({
    source: this.startEquipment,
    computation: (equipment) => equipment,
  });

  onEquipmentConfirmed(names: string[]): void {
    this.equipment.set(names);
    this.equipmentPickerOpen.set(false);
  }

  private readonly battalions = toSignal(this.api.getBattalions(), { initialValue: [] as Battalion[] });
  readonly battalionGroups = computed(() =>
    BATTALION_TYPE_ORDER.map((type) => ({ type, battalions: this.battalions().filter((battalion) => battalion.type === type) })),
  );

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => this.abilityNames().includes(ability.name)),
  );
  readonly equippedAbilityNames = computed(() => abilitiesAt(this.equippedAbilities(), this.level()).map((ability) => ability.name));

  readonly mountedNow = computed(() => {
    const unitClass = stepAtLevel(this.steps(), this.level())?.unitClass;

    return unitClass !== undefined && isMountedClass(unitClass.name);
  });

  onAbilitiesConfirmed(names: string[]): void {
    this.abilityNames.set(names);
    this.abilityPickerOpen.set(false);
  }

  setBattalion(value: string): void {
    this.battalion.set(this.battalions().find((battalion) => String(battalion.id) === value) ?? null);
  }

  readonly startSummary = computed(() => {
    const start = this.start();

    if (!start) {
      return;
    }

    if (start.source === 'manual') {
      return start.baseStats
        ? 'Manual · Lv 1 base stats'
        : `Manual · Lv ${start.level} ${start.inGameStats ? 'in-game' : 'base'} stats`;
    }

    return `Recruitment · ${routeLabel(start.routeKey ?? '')} · Chapter ${start.chapterNumber} · Lv ${start.level} ${start.className ? classLabel(start.className, start.unit) : ''}`.trim();
  });

  private readonly steps = computed(() => this.start()?.steps ?? []);

  readonly planSummary = computed(() => {
    const steps = this.steps();
    const first = steps[0]?.unitClass;
    const last = stepAtLevel(steps, this.level())?.unitClass;

    if (!first || !last) {
      return '';
    }

    return first.id === last.id ? first.name : `${first.name} → ${last.name}`;
  });

  readonly level = computed(() =>
    Math.min(MAX_PROJECTION_LEVEL, Math.max(this.start()?.level ?? 1, this.options().level)),
  );

  private bonusesAt(level: number, gear: InGameGear): GrowthRates {
    const step = stepAtLevel(this.steps(), level);

    return inGameBonus(this.start()?.name ?? '', level, step?.unitClass ?? null, step?.mount ?? null, step?.bondLevel ?? null, gear);
  }

  private readonly enteredGear = computed<InGameGear>(() => {
    const start = this.start();

    return { abilities: start?.abilities ?? [], weapon: start?.weapon ?? null, battalion: start?.battalion ?? null, equipment: start?.equipment };
  });

  private readonly cardGear = computed<InGameGear>(() => ({
    equipment: this.equipment(),
    abilities: this.equippedAbilities(),
    weapon: this.weapon(),
    battalion: this.battalion(),
  }));

  private readonly baseStats = computed<GrowthRates | null>(() => {
    const start = this.start();

    if (!start || this.steps().length === 0) {
      return null;
    }

    if (start.source === 'chapter') {
      return start.stats;
    }

    if (start.inGameStats) {
      const bonuses = this.bonusesAt(start.level, this.enteredGear());

      return Object.fromEntries(this.statKeys.map((stat) => [stat, start.stats[stat] - bonuses[stat]])) as GrowthRates;
    }

    const startingClass = stepAtLevel(this.steps(), start.level)?.unitClass;

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, Math.max(start.stats[stat], startingClass?.classFloorStats[stat] ?? 0)]),
    ) as GrowthRates;
  });

  private readonly reclassFloors = computed(() => {
    const floors = new Map<number, GrowthRates>();
    const seen = new Set<number>();

    this.steps().forEach((step, index) => {
      if (index > 0 && !seen.has(step.unitClass.id)) {
        floors.set(step.fromLevel, toGrowth(step.unitClass.classFloorStats));
      }

      seen.add(step.unitClass.id);
    });

    return floors;
  });

  private readonly baseTotals = computed<Record<StatKey, StatDistribution> | null>(() => {
    const start = this.start();
    const base = this.baseStats();

    if (!start || !base) {
      return null;
    }

    const steps = this.steps();
    const options = this.options();
    const level = this.level();
    const reclassFloors = this.reclassFloors();
    return projectDistributions(base, start.level, level, {
      growthAt: (at) => {
        const step = stepAtLevel(steps, at);

        return step ? levelUpGrowth(start.unit, step.unitClass, at, step.mount, step.bondLevel) : null;
      },
      floorsAt: (at) => reclassFloors.get(at) ?? null,
      minimumAt: (at) => (options.minimum ? (at < options.partOneEndLevel ? 2 : 1) : 0),
      gainsAt: (at) => {
        const included = start.source === 'manual' && !start.baseStats && !start.actual;
        const boosterLevel = start.actual?.level ?? start.level;
        return !included && at === boosterLevel ? boosterStats(start.boosters ?? {}) : null;
      },
    });
  });

  private readonly inGameTotals = computed<Record<StatKey, StatDistribution> | null>(() => {
    const base = this.baseTotals();

    if (!base) {
      return null;
    }

    const bonuses = this.bonusesAt(this.level(), this.cardGear());

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, shift(base[stat], bonuses[stat])]),
    ) as Record<StatKey, StatDistribution>;
  });

  readonly totals = computed(() => (this.view() === 'base' ? this.baseTotals() : this.inGameTotals()));

  readonly actualStats = computed<StatInputs>(() => {
    const start = this.start();
    const actual = start?.actual;

    if (!actual) {
      return emptyStats();
    }

    const bonuses = actual.inGame ? this.bonusesAt(actual.level, this.enteredGear()) : toGrowth(null);

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, actual.stats[stat] === null ? null : actual.stats[stat]! - bonuses[stat]]),
    ) as StatInputs;
  });

  private readonly viewBonus = computed(() =>
    this.view() === 'base' ? toGrowth(null) : this.bonusesAt(this.level(), this.cardGear()),
  );

  private readonly shownActuals = computed(() => {
    const bonus = this.viewBonus();
    const actuals = this.start()?.actual?.level === this.level() ? this.actualStats() : emptyStats();

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, actuals[stat] === null ? null : actuals[stat]! + bonus[stat]]),
    ) as StatInputs;
  });

  readonly rows = computed<StatRow[]>(() => {
    const totals = this.totals();

    if (!totals) {
      return [];
    }

    const start = this.start();
    const step = start ? stepAtLevel(this.steps(), this.level()) : null;
    const growth = start && step
      ? levelUpGrowth(start.unit, step.unitClass, this.level(), step.mount, step.bondLevel)
      : null;

    return this.statKeys.map((stat) => {
      const distribution = totals[stat];
      const summary = summarize(distribution);
      const actual = this.shownActuals()[stat];
      const rank = actual === null ? null : rankOf(distribution, actual);
      const low = Math.min(quantile(distribution, 0.005), actual ?? Infinity);
      const high = Math.max(quantile(distribution, 0.995), actual ?? -Infinity);
      const at = (value: number) => (high === low ? 50 : ((value - low) / (high - low)) * 100);
      const classBonus = this.view() === 'inGame' ? step?.unitClass.bonusStats[stat] ?? 0 : 0;
      const modifier = this.viewBonus()[stat] - classBonus;

      return {
        stat,
        label: this.statLabels[stat],
        distribution,
        summary,
        boosted: hasStatBonus(modifier),
        detail: statBreakdown(this.fixed(summary.mean - classBonus - modifier), classBonus, modifier),
        growthRate: growth?.[stat] ?? null,
        actual,
        rank,
        ...assess(rank),
        bar: {
          wideFrom: at(summary.p10),
          wideTo: at(summary.p90),
          from: at(summary.p25),
          to: at(summary.p75),
          mean: at(summary.mean),
          actual: actual === null ? null : at(actual),
        },
      };
    });
  });

  readonly histogramRow = computed(() => this.rows().find((row) => row.stat === this.histogramStat()) ?? null);

  readonly result = computed<BuildResult | null>(() => {
    const totals = this.inGameTotals();

    return totals ? { label: this.heading(), level: this.level(), totals } : null;
  });

  constructor() {
    effect(() => this.resultChange.emit(this.result()));
  }

  setLevel(field: HTMLInputElement): void {
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.levelChange.emit(Math.min(MAX_PROJECTION_LEVEL, Math.max(this.start()?.level ?? 1, level)));
    }
  }

  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }

  fixed(value: number, digits = 2): string {
    return value.toFixed(digits);
  }

  percent(chance: number): string {
    return `${Math.round(chance * 100)}%`;
  }
}

function assess(rank: Ranking | null): Pick<StatRow, 'verdict' | 'tone'> {
  if (!rank) {
    return { verdict: null, tone: null };
  }

  if (rank.equal === 0 && (rank.below === 0 || rank.below >= 1 - 1e-9)) {
    return { verdict: 'Not possible with this plan: check the start, classes or level', tone: 'impossible' };
  }

  const better = `better than ${Math.round(rank.below * 100)}% of outcomes`;
  const { percentile } = rank;

  if (percentile < 10) {
    return { verdict: `Well below average: ${better}`, tone: 'low' };
  }

  if (percentile < 25) {
    return { verdict: `Below average: ${better}`, tone: 'low' };
  }

  if (percentile <= 75) {
    return { verdict: `Typical: ${better}`, tone: 'typical' };
  }

  if (percentile <= 90) {
    return { verdict: `Above average: ${better}`, tone: 'high' };
  }

  return { verdict: `Well above average: ${better}`, tone: 'high' };
}
