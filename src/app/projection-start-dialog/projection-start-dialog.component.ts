import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanEntry, PlanStep } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityPickerGroups, baseStatsOf, BOOSTED_GROWTH_VARIANTS, characterKey, classLabel, GrowthRates, MAX_EQUIPPED_ABILITIES, SKILL_LABELS, STAT_KEYS, STAT_LABELS, StatBoostAbility, StatKey, Unit, WEAPON_KEYS, WeaponKey } from '../models/growth.models';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { RecruitmentChapter } from '../models/recruitment.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';

export type StartSource = 'chapter' | 'manual';
export interface ProjectionStart {
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
  imports: [ClassPlanComponent, PickerDialogComponent, SearchableSelectComponent],
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
  private readonly boostedNames = new Set(Object.values(BOOSTED_GROWTH_VARIANTS));

  readonly source = signal<StartSource>('manual');

  readonly characters = computed(() =>
    this.spoilers
      .filter(this.allUnits())
      .filter((unit) => !this.boostedNames.has(unit.name) && this.recruitment.routesWithChapters(unit.name).length > 0),
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
    const boosted = unit ? BOOSTED_GROWTH_VARIANTS[characterKey(unit.name)] : undefined;

    return (boosted && this.allUnits().find((candidate) => candidate.name === boosted)) || unit;
  });

  // --- manual entry ----------------------------------------------------------------

  readonly manualUnits = computed(() => this.spoilers.filter(this.allUnits()));
  readonly manualUnitId = signal<number | null>(null);
  readonly manualLevel = signal(1);
  readonly manualStats = signal<StatInputs>(emptyStats());
  readonly manualLevelEdited = signal(false);
  readonly manualStatsEdited = signal(false);
  readonly ownStats = computed(() => this.manualLevelEdited() || this.manualStatsEdited());

  readonly inGameStats = signal(false);
  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  readonly weaponKeys = WEAPON_KEYS;
  readonly weaponLabels = SKILL_LABELS;
  private readonly abilityNames = signal<readonly string[]>([]);
  readonly weapon = signal<WeaponKey | null>(null);

  private readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), { initialValue: [] as StatBoostAbility[] });

  readonly abilityOptions = computed(() =>
    abilitiesFor(this.statBoostAbilities(), (this.source() === 'chapter' ? this.unit() : this.manualUnit())?.name ?? null),
  );
  readonly abilityGroups = computed(() => abilityPickerGroups(this.abilityOptions()));

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => this.abilityNames().includes(ability.name)),
  );
  readonly equippedAbilityNames = computed(() => this.equippedAbilities().map((ability) => ability.name));

  readonly needsWeapon = computed(() => this.equippedAbilities().some((ability) => ability.weaponBoosts));

  readonly abilityPickerOpen = signal(false);

  onAbilitiesConfirmed(names: string[]): void {
    this.abilityNames.set(names);
    this.abilityPickerOpen.set(false);
  }

  setWeapon(value: string): void {
    this.weapon.set(WEAPON_KEYS.find((weapon) => weapon === value) ?? null);
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
    }

    field.value = this.actualLevel() === null ? '' : String(this.actualLevel());
  }

  setActualStat(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;

    this.actualInputs.update((stats) => ({ ...stats, [stat]: next }));
    field.value = next === null ? '' : String(next);
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
      this.weapon.set(initial.weapon ?? null);
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
    if (source === 'manual' && this.manualUnitId() === null && this.growthUnit()) {
      this.pickManualUnit(this.growthUnit()!.id);
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
      inGameStats: entered === 'start' && inGame,
      actual,
      abilities: inGame ? this.equippedAbilities() : [],
      weapon: inGame && this.needsWeapon() ? this.weapon() : null,
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
      unit,
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

    return unit ? { unit, level: this.manualLevel(), className: null } : null;
  });

  private readonly planEditor = viewChild(ClassPlanComponent);

  confirm(): void {
    const start = this.start();

    if (start) {
      this.confirmed.emit(start);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.abilityPickerOpen()) {
      return;
    }

    this.closed.emit();
  }
}
