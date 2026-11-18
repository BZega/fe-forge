import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanEntry, PlanStep } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityPickerGroups, baseStatsOf, Battalion, BATTALION_TYPE_ORDER, classLabel, GrowthRates, MAX_EQUIPPED_ABILITIES, STAT_KEYS, STAT_LABELS, StatBoostAbility, StatKey, Unit, WeaponKey } from '../models/growth.models';
import { abilitiesAt, abilityLock, inGameBonus, MAX_EXTRA_BONUS, usesWeapon } from '../models/bonuses';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { levelUpGrowth, RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { EquipmentDialogComponent } from '../equipment-dialog/equipment-dialog.component';
import { equipmentWeapon } from '../models/equipment';

export type StartSource = 'chapter' | 'manual';
export interface ProjectionStart {
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
  imports: [ClassPlanComponent, EquipmentDialogComponent, PickerDialogComponent, SearchableSelectComponent],
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

  readonly abilityOptions = computed(() =>
    abilitiesFor(this.statBoostAbilities(), (this.source() === 'chapter' ? this.unit() : this.manualUnit())?.name ?? null),
  );
  readonly enteredLevel = computed(() => (this.entered() === 'actual' ? (this.actualLevel() ?? 1) : this.manualLevel()));

  readonly abilityGroups = computed(() => abilityPickerGroups(this.abilityOptions(), (ability) => abilityLock(ability, this.enteredLevel())));

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => this.abilityNames().includes(ability.name)),
  );
  readonly equippedAbilityNames = computed(() =>
    abilitiesAt(this.equippedAbilities(), this.enteredLevel()).map((ability) => ability.name),
  );

  readonly personalWeapon = computed(() => usesWeapon(this.enteredName(), this.enteredLevel(), []));

  private readonly enteredName = computed(() => (this.source() === 'chapter' ? this.unit() : this.manualUnit())?.name ?? '');

  readonly battalion = signal<Battalion | null>(null);
  private readonly battalions = toSignal(this.api.getBattalions(), { initialValue: [] as Battalion[] });
  readonly battalionGroups = computed(() =>
    BATTALION_TYPE_ORDER.map((type) => ({ type, battalions: this.battalions().filter((battalion) => battalion.type === type) })),
  );

  setBattalion(value: string): void {
    this.battalion.set(this.battalions().find((battalion) => String(battalion.id) === value) ?? null);
  }

  readonly abilityPickerOpen = signal(false);
  readonly equipmentPickerOpen = signal(false);
  readonly equipment = signal<readonly string[]>([]);

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
      this.actualLevel.set(Math.min(MAX_PROJECTION_LEVEL, Math.max(this.planStart()?.level ?? 1, level)));
      this.clampActuals(this.typingLimits());
    }

    field.value = this.actualLevel() === null ? '' : String(this.actualLevel());
  }

  setActualStat(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;
    const limit = this.typingLimits()?.[stat];
    const kept = next === null || limit === undefined ? next : Math.min(next, limit);

    this.actualInputs.update((stats) => ({ ...stats, [stat]: kept }));
    field.value = kept === null ? '' : String(kept);
  }

  setInGame(inGame: boolean): void {
    this.inGameStats.set(inGame);
    this.clampActuals(this.typingLimits());
  }

  private readonly maxBase = computed<GrowthRates | null>(() => {
    const from = this.planStart();
    const level = this.actualLevel();
    const steps = this.planEditor()?.steps() ?? [];
    const start = this.source() === 'chapter' ? this.chapter()?.stats : this.manualStats();

    if (!from || level === null || steps.length === 0 || !start || this.statKeys.some((stat) => start[stat] === null)) {
      return null;
    }

    const startingClass = stepAtLevel(steps, from.level)?.unitClass;
    const stats = Object.fromEntries(
      this.statKeys.map((stat) => [stat, Math.max(start[stat]!, this.source() === 'chapter' ? 0 : (startingClass?.classFloorStats[stat] ?? 0))]),
    ) as GrowthRates;
    const seen = new Set(startingClass ? [startingClass.id] : []);

    for (let at = from.level; at <= level; at++) {
      const step = stepAtLevel(steps, at);

      if (step && at > from.level && step.fromLevel === at && !seen.has(step.unitClass.id)) {
        seen.add(step.unitClass.id);
        this.statKeys.forEach((stat) => (stats[stat] = Math.max(stats[stat], step.unitClass.classFloorStats[stat])));
      }

      if (step && at < level) {
        const growth = levelUpGrowth(from.unit, step.unitClass, at, step.mount, step.bondLevel);
        this.statKeys.forEach((stat) => (stats[stat] += growth[stat] > 0 ? Math.ceil(growth[stat] / 100) : 0));
      }
    }

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

  private equippedLimits(): GrowthRates | null {
    const max = this.maxBase();
    const step = stepAtLevel(this.planEditor()?.steps() ?? [], this.actualLevel() ?? 0);

    if (!max || !this.inGameStats()) {
      return max;
    }

    const bonus = inGameBonus(this.enteredName(), this.actualLevel()!, step?.unitClass ?? null, step?.mount ?? null, step?.bondLevel ?? null, {
      equipment: this.equipment(),
      abilities: this.equippedAbilities(),
      weapon: this.weapon(),
      battalion: this.battalion(),
    });

    return Object.fromEntries(this.statKeys.map((stat) => [stat, max[stat] + bonus[stat]])) as GrowthRates;
  }

  private clampActuals(limits: GrowthRates | null): void {
    if (limits && this.entered() === 'actual') {
      this.actualInputs.update((stats) =>
        Object.fromEntries(this.statKeys.map((stat) => [stat, stats[stat] === null ? null : Math.min(stats[stat]!, limits[stat])])) as StatInputs,
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

    if (initial) {
      this.options.set({ ...initial.options });
      this.abilityNames.set((initial.abilities ?? []).map((ability) => ability.name));
      this.equipment.set(initial.equipment ?? []);
      this.battalion.set(initial.battalion ?? null);
      this.inGameStats.set(initial.inGameStats ?? initial.actual?.inGame ?? false);

      if (initial.actual) {
        this.compareActuals.set(true);
        this.actualLevel.set(initial.actual.level);
        this.actualInputs.set({ ...initial.actual.stats });
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
    const actual = entered === 'actual' && actualLevel !== null
      ? { level: actualLevel, stats: { ...this.actualInputs() }, inGame }
      : null;
    const shared = {
      equipment: inGame ? this.equipment() : [],
      inGameStats: entered === 'start' && inGame,
      actual,
      abilities: inGame ? this.equippedAbilities() : [],
      weapon: inGame ? this.weapon() : null,
      battalion: inGame ? this.battalion() : null,
      plan: plan.plan(),
      steps,
      options: actual ? { ...this.options(), level: actual.level } : this.options(),
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

  confirm(): void {
    this.clampActuals(this.equippedLimits());
    const start = this.start();

    if (start) {
      this.confirmed.emit(start);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.abilityPickerOpen() || this.equipmentPickerOpen()) {
      return;
    }

    this.closed.emit();
  }
}
