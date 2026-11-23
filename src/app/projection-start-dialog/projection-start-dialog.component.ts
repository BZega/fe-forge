import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanEntry, PlanStep } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityAvailableInClasses, abilityFamily, baseStatsOf, Battalion, BATTALION_TYPE_ORDER, ClassAbility, classLabel, GrowthRates, MAX_EQUIPPED_ABILITIES, STAT_KEYS, STAT_LABELS, StatBoostAbility, StatKey, toGrowth, Unit, UnitClass, WeaponKey } from '../models/growth.models';
import { abilitiesAt, inGameBonus, MAX_EXTRA_BONUS, statAbilityPickerGroups, usesWeapon } from '../models/bonuses';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { levelUpGrowth, RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { EquipmentDialogComponent } from '../equipment-dialog/equipment-dialog.component';
import { equipmentWeapon } from '../models/equipment';
import { BoosterCounts, BoosterEntry, boosterStats } from '../models/stat-boosters';
import { StatBoosterDialogComponent } from '../stat-booster-dialog/stat-booster-dialog.component';
import { MAX_BASE_STATS } from '../models/growth.models';
import { StatIncreaseMenuComponent } from '../stat-increase-menu/stat-increase-menu.component';
import { BattalionDialogComponent } from '../battalion-dialog/battalion-dialog.component';
import { AbilityWarningDialogComponent } from '../ability-warning-dialog/ability-warning-dialog.component';

export type StartSource = 'chapter' | 'manual';
export interface ProjectionStart {
  transactionId?: string;
  boosters?: BoosterCounts;
  equipment?: readonly string[];
  source: StartSource;
  unit: Unit;
  name: string;
  level: number;
  className: string | null;
  stats: GrowthRates;
  chapters: readonly RecruitmentChapter[];
  routeKey: string | null;
  chapterNumber: number | null;
  baseStats: boolean;
  inGameStats?: boolean;
  actual?: ProjectionActual | null;
  actuals?: readonly ProjectionActual[];
  abilities?: readonly StatBoostAbility[];
  weapon?: WeaponKey | null;
  battalion?: Battalion | null;
  plan: readonly PlanEntry[];
  steps: readonly PlanStep[];
  options: ProjectionOptions;
}

export interface ProjectionActual {
  level: number;
  stats: Readonly<Record<StatKey, number | null>>;
  inGame: boolean;
}

export interface ProjectionOptions {
  level: number;
  minimum: boolean;
  partOneEndLevel: number;
  wideRange: boolean;
}

export function projectionActuals(start: Pick<ProjectionStart, 'actual' | 'actuals'> | null): ProjectionActual[] {
  if (!start) return [];
  const actuals = start.actuals?.length ? start.actuals : start.actual ? [start.actual] : [];
  return [...new Map(actuals.map((actual) => [actual.level, actual])).values()].sort((a, b) => a.level - b.level);
}

export const DEFAULT_PROJECTION_OPTIONS: ProjectionOptions = {
  level: MAX_PROJECTION_LEVEL,
  minimum: false,
  partOneEndLevel: 1,
  wideRange: false,
};

type StatInputs = Record<StatKey, number | null>;

const emptyStats = (): StatInputs => Object.fromEntries(STAT_KEYS.map((stat) => [stat, null])) as StatInputs;

@Component({
  selector: 'app-projection-start-dialog',
  imports: [AbilityWarningDialogComponent, BattalionDialogComponent, ClassPlanComponent, EquipmentDialogComponent, PickerDialogComponent, SearchableSelectComponent, StatBoosterDialogComponent, StatIncreaseMenuComponent],
  templateUrl: './projection-start-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-start-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionStartDialogComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly recruitment = inject(RecruitmentDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly heading = input('Projected Stats');
  readonly eyebrow = input('');
  readonly confirmLabel = input('Next');
  readonly initialSource = input<StartSource>('manual');
  readonly initial = input<ProjectionStart | null>(null);
  readonly showOptions = input(false);
  readonly addActualsInitially = input(false);

  readonly confirmed = output<ProjectionStart>();
  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly classLabel = classLabel;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  private readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });

  readonly source = signal<StartSource>('manual');

  readonly characters = computed(() =>
    this.api
      .pickableUnits(this.spoilers.filter(this.allUnits()))
      .filter((unit) => this.recruitment.routesWithChapters(unit.name).length > 0),
  );

  readonly unitId = signal<number | null>(null);

  readonly unit = computed(() => this.characters().find((unit) => unit.id === this.unitId()) ?? null);

  readonly routes = computed(() => {
    const unit = this.unit();

    return unit ? this.recruitment.routesWithChapters(unit.name) : [];
  });

  readonly routeKey = linkedSignal<readonly { key: string }[], string | null>({
    source: this.routes,
    computation: (routes, previous) => routes.find((route) => route.key === previous?.value)?.key ?? routes[0]?.key ?? null,
  });

  readonly route = computed(() => this.routes().find((route) => route.key === this.routeKey()) ?? null);

  readonly chapterNumber = linkedSignal(() => this.route()?.chapters[0]?.chapter ?? null);

  readonly chapter = computed(() => this.route()?.chapters.find((chapter) => chapter.chapter === this.chapterNumber()) ?? null);

  readonly growthUnit = computed(() => {
    const unit = this.unit();

    return unit ? this.api.withGrowthBonus(unit) : null;
  });

  // --- manual entry ----------------------------------------------------------------

  readonly manualUnits = computed(() => this.api.pickableUnits(this.spoilers.filter(this.allUnits())));
  readonly manualUnitId = signal<number | null>(null);
  readonly manualLevel = signal(1);
  readonly manualStats = signal<StatInputs>(emptyStats());
  readonly manualLevelEdited = signal(false);
  readonly manualStatsEdited = signal(false);
  readonly ownStats = computed(() => this.manualLevelEdited() || this.manualStatsEdited());

  readonly inGameStats = signal(false);
  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  private readonly abilityNames = signal<readonly string[]>([]);
  readonly weapon = computed(() => equipmentWeapon(this.equipment()));

  private readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), { initialValue: [] as StatBoostAbility[] });
  private readonly classAbilities = toSignal(this.api.getClassAbilities(), { initialValue: [] as ClassAbility[] });
  private readonly classes = toSignal(this.api.getClasses(), { initialValue: [] as UnitClass[] });

  readonly abilityOptions = computed(() =>
    abilitiesFor(this.statBoostAbilities(), (this.source() === 'chapter' ? this.unit() : this.manualUnit())?.name ?? null),
  );
  readonly enteredLevel = computed(() => {
    if (this.entered() === 'actual') return this.actualLevel() ?? this.options().level;
    return this.entered() === 'start' && this.inGameStats() ? this.manualLevel() : this.options().level;
  });

  readonly abilityGroups = computed(() => statAbilityPickerGroups(this.abilityOptions(), this.enteredLevel()));

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => !ability.upgradeOf && this.abilityNames().includes(abilityFamily(ability))),
  );
  readonly equippedAbilityNames = computed(() =>
    abilitiesAt(this.equippedAbilities(), this.enteredLevel()).map(abilityFamily),
  );

  readonly personalWeapon = computed(() => usesWeapon(this.enteredName(), this.enteredLevel(), []));

  private readonly enteredName = computed(() => (this.source() === 'chapter' ? this.unit() : this.manualUnit())?.name ?? '');

  readonly battalion = signal<Battalion | null>(null);
  readonly battalions = toSignal(this.api.getBattalions(), { initialValue: [] as Battalion[] });
  readonly battalionPickerOpen = signal(false);
  readonly battalionGroups = computed(() =>
    BATTALION_TYPE_ORDER.map((type) => ({ type, battalions: this.battalions().filter((battalion) => battalion.type === type) })),
  );

  setBattalion(value: string): void {
    this.battalion.set(this.battalions().find((battalion) => String(battalion.id) === value) ?? null);
  }

  readonly abilityPickerOpen = signal(false);
  readonly equipmentPickerOpen = signal(false);
  readonly equipment = signal<readonly string[]>([]);
  readonly boosters = signal<BoosterCounts>({});
  readonly boosterPickerOpen = signal(false);
  readonly boosterEntries = computed<BoosterEntry[]>(() => [{
    key: null, label: this.entered() === 'actual' ? `Used by Lv ${this.actualLevel() ?? '…'}` : `Used by Lv ${this.manualLevel()}`,
    counts: this.boosters(),
  }]);
  readonly boosterContext = computed(() => this.entered()
    ? 'Record boosters already included in your entered stats. They increase the legal base-stat range without being added twice.'
    : 'Boosters are added to the app-provided base stats before projecting level ups.');

  onBoostersConfirmed(entries: BoosterEntry[]): void {
    this.boosters.set(entries[0].counts);
    this.boosterPickerOpen.set(false);
  }

  onEquipmentConfirmed(names: string[]): void {
    this.equipment.set(names);
    this.equipmentPickerOpen.set(false);
  }

  onAbilitiesConfirmed(names: string[]): void {
    this.abilityNames.set(names);
    this.abilityPickerOpen.set(false);
  }

  // --- actual stats ----------------------------------------------------------------

  readonly canCompare = computed(() => this.source() === 'chapter' || !this.ownStats());
  readonly compareActuals = signal(false);
  readonly actualLevel = signal<number | null>(null);
  readonly actualInputs = signal<StatInputs>(emptyStats());

  readonly entered = computed<'start' | 'actual' | null>(() =>
    this.source() === 'manual' && this.ownStats() ? 'start' : this.canCompare() && this.compareActuals() ? 'actual' : null,
  );

  setActualLevel(event: Event): void {
    const field = event.target as HTMLInputElement;
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      const chosen = Math.min(MAX_PROJECTION_LEVEL, Math.max(this.planStart()?.level ?? 1, level));
      this.actualLevel.set(chosen);
      const existing = projectionActuals(this.initial()).find((actual) => actual.level === chosen);
      if (existing) {
        this.inGameStats.set(existing.inGame);
        this.actualInputs.set({ ...existing.stats });
      } else {
        this.actualInputs.set(emptyStats());
      }
      this.clampActuals(this.typingLimits());
    }

    field.value = this.actualLevel() === null ? '' : String(this.actualLevel());
  }

  setActualStat(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;
    const limits = this.typingLimits();
    const floor = this.typingFloor()?.[stat];
    const kept = next === null ? null : Math.max(floor ?? 0, Math.min(next, limits?.[stat] ?? next));

    this.actualInputs.update((stats) => ({ ...stats, [stat]: kept }));
    field.value = kept === null ? '' : String(kept);
  }

  setInGame(inGame: boolean): void {
    this.inGameStats.set(inGame);
    this.clampActuals(this.typingLimits());
  }

  private readonly maxBase = computed<GrowthRates | null>(() => {
    const initial = this.initial();
    const from = this.planStart() ?? (initial ? {
      unit: this.api.withGrowthBonus(initial.unit),
      level: initial.level,
      className: initial.className,
    } : null);
    const level = this.actualLevel();
    const emittedSteps = this.planEditor()?.steps() ?? [];
    const fallbackClass = from?.className ? this.classes().find((unitClass) => unitClass.name === from.className) : null;
    const steps: readonly PlanStep[] = emittedSteps.length > 0 || !from || !fallbackClass
      ? emittedSteps
      : [{ fromLevel: from.level, unitClass: fallbackClass, mount: null, bondLevel: null }];
    const start = this.source() === 'chapter'
      ? this.chapter()?.stats ?? initial?.stats
      : this.manualStats();

    if (!from || level === null || steps.length === 0 || !start || this.statKeys.some((stat) => start[stat] === null)) {
      return null;
    }

    const previous = projectionActuals(this.initial())
      .filter((actual) => actual.level < level)
      .at(-1);
    let anchorLevel = from.level;
    let stats: GrowthRates;

    if (previous) {
      const priorStep = stepAtLevel(steps, previous.level);
      const priorBonus = previous.inGame
        ? inGameBonus(this.enteredName(), previous.level, priorStep?.unitClass ?? null, priorStep?.mount ?? null, priorStep?.bondLevel ?? null, {
            equipment: this.equipment(), abilities: this.equippedAbilities(), weapon: this.weapon(), battalion: this.battalion(),
          })
        : toGrowth(null);
      stats = Object.fromEntries(this.statKeys.map((stat) => [
        stat,
        previous.stats[stat] === null ? 0 : previous.stats[stat]! - priorBonus[stat],
      ])) as GrowthRates;
      anchorLevel = previous.level;
    } else {
      const startingClass = stepAtLevel(steps, from.level)?.unitClass;
      stats = Object.fromEntries(
        this.statKeys.map((stat) => [stat, Math.max(start[stat]!, this.source() === 'chapter' ? 0 : (startingClass?.classFloorStats[stat] ?? 0))]),
      ) as GrowthRates;
    }

    const seen = new Set(steps.filter((step) => step.fromLevel <= anchorLevel).map((step) => step.unitClass.id));

    for (let at = anchorLevel; at < level; at++) {
      const step = stepAtLevel(steps, at);

      if (step && at > anchorLevel && step.fromLevel === at && !seen.has(step.unitClass.id)) {
        seen.add(step.unitClass.id);
        this.statKeys.forEach((stat) => stats[stat] = Math.max(stats[stat], step.unitClass.classFloorStats[stat]));
      }

      if (step) {
        const growth = levelUpGrowth(from.unit, step.unitClass, at, step.mount, step.bondLevel);
        this.statKeys.forEach((stat) => {
          const rate = growth[stat];
          stats[stat] += rate > 100 ? 2 : rate > 0 ? 1 : 0;
        });
      }
    }

    if (!previous) {
      const boosters = boosterStats(this.boosters());
      this.statKeys.forEach((stat) => stats[stat] += boosters[stat]);
    }
    this.statKeys.forEach((stat) => stats[stat] = Math.min(MAX_BASE_STATS[stat], stats[stat]));
    return stats;
  });

  private typingLimits(): GrowthRates | null {
    const max = this.maxBase();
    const step = stepAtLevel(this.planEditor()?.steps() ?? [], this.actualLevel() ?? 0);

    if (!max || !this.inGameStats()) {
      return max;
    }

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, max[stat] + (step?.unitClass.bonusStats[stat] ?? 0) + MAX_EXTRA_BONUS]),
    ) as GrowthRates;
  }

  private typingFloor(): GrowthRates | null {
    const level = this.actualLevel();
    if (level === null) return null;
    const previous = projectionActuals(this.initial())
      .filter((actual) => actual.level < level)
      .at(-1);
    if (!previous) return null;

    const priorStep = stepAtLevel(this.planEditor()?.steps() ?? [], previous.level);
    const priorBonus = previous.inGame
      ? inGameBonus(this.enteredName(), previous.level, priorStep?.unitClass ?? null, priorStep?.mount ?? null, priorStep?.bondLevel ?? null, {
          equipment: this.equipment(), abilities: this.equippedAbilities(), weapon: this.weapon(), battalion: this.battalion(),
        })
      : toGrowth(null);
    const targetStep = stepAtLevel(this.planEditor()?.steps() ?? [], level);
    const targetBonus = this.inGameStats()
      ? inGameBonus(this.enteredName(), level, targetStep?.unitClass ?? null, targetStep?.mount ?? null, targetStep?.bondLevel ?? null, {
          equipment: this.equipment(), abilities: this.equippedAbilities(), weapon: this.weapon(), battalion: this.battalion(),
        })
      : toGrowth(null);

    return Object.fromEntries(this.statKeys.map((stat) => [
      stat,
      previous.stats[stat] === null ? 0 : previous.stats[stat]! - priorBonus[stat] + targetBonus[stat],
    ])) as GrowthRates;
  }

  private equippedLimits(): GrowthRates | null {
    const max = this.maxBase();
    const step = stepAtLevel(this.planEditor()?.steps() ?? [], this.actualLevel() ?? 0);

    if (!max || !this.inGameStats()) {
      return max;
    }

    const bonus = inGameBonus(this.enteredName(), this.actualLevel()!, step?.unitClass ?? null, step?.mount ?? null, step?.bondLevel ?? null, {
      equipment: this.equipment(),
      abilities: this.equippedAbilities().filter((ability) =>
        abilityAvailableInClasses(ability, (this.planEditor()?.steps() ?? []).map((entry) => entry.unitClass), this.classAbilities())),
      weapon: this.weapon(),
      battalion: this.battalion(),
    });

    return Object.fromEntries(this.statKeys.map((stat) => [stat, max[stat] + bonus[stat]])) as GrowthRates;
  }

  private clampActuals(limits: GrowthRates | null): void {
    if (limits && this.entered() === 'actual') {
      const floor = this.typingFloor();
      this.actualInputs.update((stats) =>
        Object.fromEntries(this.statKeys.map((stat) => [
          stat,
          stats[stat] === null ? null : Math.max(floor?.[stat] ?? 0, Math.min(stats[stat]!, limits[stat])),
        ])) as StatInputs,
      );
    }
  }

  private readonly manualUnit = computed(() => this.manualUnits().find((unit) => unit.id === this.manualUnitId()) ?? null);

  // --- options -------------------------------------------------------------------

  readonly options = signal<ProjectionOptions>(DEFAULT_PROJECTION_OPTIONS);

  setOption<K extends keyof ProjectionOptions>(key: K, value: ProjectionOptions[K]): void {
    this.options.update((options) => ({ ...options, [key]: value }));
  }

  setLevelOption(field: HTMLInputElement, key: 'level' | 'partOneEndLevel'): void {
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.setOption(key, Math.min(MAX_PROJECTION_LEVEL, Math.max(1, level)));
    }

    field.value = String(this.options()[key]);
  }

  readonly hasBaseStats = computed(() => {
    const unit = this.manualUnit();

    return unit !== null && baseStatsOf(unit.name) !== null;
  });

  ngOnInit(): void {
    const initial = this.initial();

    this.source.set(initial?.source ?? this.initialSource());

    if (this.addActualsInitially()) {
      this.compareActuals.set(true);
    }

    if (initial) {
      this.options.set({ ...initial.options });
      this.boosters.set({ ...initial.boosters });
      this.abilityNames.set((initial.abilities ?? []).map(abilityFamily));
      this.equipment.set(initial.equipment ?? []);
      this.battalion.set(initial.battalion ?? null);
      const actuals = projectionActuals(initial);
      this.inGameStats.set(initial.inGameStats ?? actuals.at(-1)?.inGame ?? false);

      if (actuals.length > 0) {
        this.compareActuals.set(true);
        const latest = actuals.at(-1)!;
        this.actualLevel.set(this.addActualsInitially() ? latest.level + 1 : latest.level);
        this.actualInputs.set(this.addActualsInitially() ? emptyStats() : { ...latest.stats });
      }
    }

    if (initial?.source === 'chapter') {
      this.unitId.set(this.characters().find((unit) => unit.name === initial.name)?.id ?? null);
      this.routeKey.set(initial.routeKey);
      this.chapterNumber();
      this.chapterNumber.set(initial.chapterNumber);
    } else if (initial) {
      this.manualUnitId.set(initial.unit.id);
      this.manualLevel.set(initial.level);
      this.manualStats.set({ ...initial.stats });
      this.manualLevelEdited.set(!initial.baseStats);
    }
  }

  setSource(source: StartSource): void {
    if (source === 'manual' && this.manualUnitId() === null && this.unit()) {
      this.pickManualUnit(this.unit()!.id);
    }

    this.source.set(source);
  }

  pickManualUnit(id: number | null): void {
    this.manualUnitId.set(id);

    if (!this.manualLevelEdited()) {
      this.useBaseStats();
    }
  }

  useBaseStats(): void {
    const unit = this.manualUnit();
    const base = unit ? baseStatsOf(unit.name) : null;

    if (base) {
      this.manualLevel.set(1);
      this.manualStats.set({ ...base });
      this.manualLevelEdited.set(false);
      this.manualStatsEdited.set(false);
    }
  }

  setManualLevel(event: Event): void {
    const field = event.target as HTMLInputElement;
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.manualLevel.set(Math.min(MAX_PROJECTION_LEVEL - 1, Math.max(1, level)));
      this.manualLevelEdited.set(true);
    }

    field.value = String(this.manualLevel());
  }

  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }

  setStat(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;

    this.manualStats.update((stats) => ({ ...stats, [stat]: next }));
    this.manualStatsEdited.set(true);
    field.value = next === null ? '' : String(next);
  }

  readonly start = computed<ProjectionStart | null>(() => {
    const plan = this.planEditor();
    const steps = plan?.steps() ?? [];

    if (!plan || steps.length === 0) {
      return null;
    }

    const entered = this.entered();
    const inGame = entered !== null && this.inGameStats();
    const actualLevel = this.actualLevel();
    const existingActuals = projectionActuals(this.initial());
    const currentActual = entered === 'actual' && actualLevel !== null
      ? { level: actualLevel, stats: { ...this.actualInputs() }, inGame }
      : null;
    const actuals = currentActual
      ? [...existingActuals.filter((entry) => entry.level !== currentActual.level), currentActual]
          .sort((a, b) => a.level - b.level)
      : existingActuals;
    const shared = {
      transactionId: this.initial()?.transactionId,
      boosters: { ...this.boosters() },
      equipment: this.equipment(),
      inGameStats: entered === 'start' && inGame,
      actual: actuals.at(-1) ?? null,
      actuals,
      abilities: this.equippedAbilities().filter((ability) =>
        abilityAvailableInClasses(ability, steps.map((step) => step.unitClass), this.classAbilities())),
      weapon: this.weapon(),
      battalion: this.battalion(),
      plan: plan.plan(),
      steps,
      options: actuals.length > 0 ? { ...this.options(), level: actuals.at(-1)!.level } : this.options(),
    };

    if (this.source() === 'chapter') {
      const unit = this.growthUnit();
      const picked = this.unit();
      const chapter = this.chapter();

      return unit && picked && chapter
        ? {
            source: 'chapter',
            unit,
            name: picked.name,
            level: chapter.level,
            className: chapter.className,
            stats: chapter.stats,
            chapters: this.route()!.chapters,
            routeKey: this.routeKey(),
            chapterNumber: chapter.chapter,
            baseStats: false,
            ...shared,
          }
        : null;
    }

    const unit = this.manualUnit();
    const stats = this.manualStats();

    if (!unit || this.statKeys.some((stat) => stats[stat] === null)) {
      return null;
    }

    return {
      source: 'manual',
      unit: this.api.withGrowthBonus(unit),
      name: unit.name,
      level: this.manualLevel(),
      className: null,
      stats: stats as GrowthRates,
      chapters: [],
      routeKey: null,
      chapterNumber: null,
      baseStats: !this.ownStats(),
      ...shared,
    };
  });

  readonly planStart = computed<{ unit: Unit; level: number; className: string | null } | null>(() => {
    if (this.source() === 'chapter') {
      const unit = this.growthUnit();
      const chapter = this.chapter();

      return unit && chapter ? { unit, level: chapter.level, className: chapter.className } : null;
    }

    const unit = this.manualUnit();

    return unit ? { unit: this.api.withGrowthBonus(unit), level: this.manualLevel(), className: null } : null;
  });

  private readonly planEditor = viewChild(ClassPlanComponent);
  readonly showAbilityWarning = signal(false);
  readonly missingAbilities = computed(() => {
    const planned = (this.planEditor()?.steps() ?? []).map((step) => step.unitClass);
    return this.equippedAbilities()
      .filter((ability) => !abilityAvailableInClasses(ability, planned, this.classAbilities()))
      .map((ability) => {
        const definition = this.classAbilities().find((candidate) => candidate.name === ability.name);
        const teachers = definition ? this.classes().filter((unitClass) => unitClass.masterAbilities.includes(definition.id)) : [];
        return { name: ability.name, teachers: teachers.map((unitClass) => unitClass.name) };
      });
  });

  confirm(): void {
    if (!this.start()) return;
    if (this.missingAbilities().length > 0) {
      this.showAbilityWarning.set(true);
      return;
    }
    this.finishConfirm();
  }

  finishConfirm(): void {
    this.showAbilityWarning.set(false);
    this.clampActuals(this.equippedLimits());
    const start = this.start();

    if (start) {
      this.confirmed.emit(start);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.abilityPickerOpen() || this.equipmentPickerOpen() || this.boosterPickerOpen() || this.battalionPickerOpen()) {
      return;
    }
    if (this.showAbilityWarning()) {
      this.showAbilityWarning.set(false);
      return;
    }

    this.closed.emit();
  }
}
