import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanStep } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityAvailableInClasses, abilityFamily, Battalion, BATTALION_TYPE_ORDER, ClassAbility, classLabel, MAX_EQUIPPED_ABILITIES, StatBoostAbility, STAT_KEYS, STAT_LABELS, Unit, UnitClass, WeaponKey } from '../models/growth.models';
import { abilitiesAt, InGameGear, inGameBonus, isMountedClass, statAbilityPickerGroups, usesWeapon } from '../models/bonuses';
import { levelUpGrowth, projectStats, RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { DEFAULT_PROJECTION_OPTIONS, ProjectionActual, ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { EquipmentDialogComponent } from '../equipment-dialog/equipment-dialog.component';
import { equipmentWeapon } from '../models/equipment';
import { hasStatBonus, statBreakdown } from '../models/stat-display';
import { BoosterCounts, BoosterEntry, boosterStats, sumBoosters } from '../models/stat-boosters';
import { StatBoosterDialogComponent } from '../stat-booster-dialog/stat-booster-dialog.component';
import { MAX_BASE_STATS } from '../models/growth.models';
import { StatIncreaseMenuComponent } from '../stat-increase-menu/stat-increase-menu.component';
import { BattalionDialogComponent } from '../battalion-dialog/battalion-dialog.component';
import { ProjectionSaveStorageService } from '../services/projection-save-storage.service';

export type ActualTone = 'higher' | 'even' | 'lower';

@Component({
  selector: 'app-projection-dialog',
  imports: [BattalionDialogComponent, ClassPlanComponent, EquipmentDialogComponent, PickerDialogComponent, StatBoosterDialogComponent, StatIncreaseMenuComponent],
  templateUrl: './projection-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionDialogComponent implements OnInit {
  readonly unit = input.required<Unit>();
  readonly classLabel = classLabel;
  readonly chapters = input.required<readonly RecruitmentChapter[]>();
  readonly initialChapter = input<number | null>(null);
  readonly chapterPicker = input(true);
  readonly plannedSteps = input<readonly PlanStep[] | null>(null);
  readonly transferSource = input<ProjectionStart | null>(null);
  readonly actuals = input<readonly ProjectionActual[]>([]);
  readonly history = input<{ start: RecruitmentChapter; steps: readonly PlanStep[] } | null>(null);
  readonly abilities = input<readonly StatBoostAbility[]>([]);
  readonly availableClasses = input<readonly UnitClass[]>([]);
  readonly weapon = input<WeaponKey | null>(null);
  readonly battalion = input<Battalion | null>(null);
  readonly equipment = input<readonly string[]>([]);
  readonly usedBoosters = input<BoosterCounts>({});
  readonly boosterHistory = input<readonly { level: number; counts: BoosterCounts }[]>([]);
  readonly boosterPickerOpen = signal(false);
  readonly boosters = signal<BoosterCounts>({});
  readonly boosterEntries = computed<BoosterEntry[]>(() => [{
    key: null, label: `Additional boosters at Lv ${this.endLevel()}`, counts: this.boosters(),
  }]);
  onBoostersConfirmed(entries: BoosterEntry[]): void {
    this.boosters.set(entries[0].counts);
    this.boosterPickerOpen.set(false);
  }
  readonly chosenEquipment = linkedSignal(() => this.equipment());
  readonly equipmentPickerOpen = signal(false);

  onEquipmentConfirmed(names: string[]): void {
    this.chosenEquipment.set(names);
    this.equipmentPickerOpen.set(false);
  }

  readonly view = signal<'base' | 'inGame'>('inGame');

  private readonly api = inject(GrowthDataService);
  private readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), { initialValue: [] as StatBoostAbility[] });
  private readonly classAbilities = toSignal(this.api.getClassAbilities(), { initialValue: [] as ClassAbility[] });

  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  readonly abilityOptions = computed(() => abilitiesFor(this.statBoostAbilities(), this.unit().name).filter((ability) =>
    abilityAvailableInClasses(ability, [...this.availableClasses(), ...this.steps().map((step) => step.unitClass)], this.classAbilities())));
  readonly abilityGroups = computed(() => statAbilityPickerGroups(this.abilityOptions(), this.endLevel()));
  private readonly abilityNames = linkedSignal<readonly string[]>(() => this.abilities().map(abilityFamily));
  readonly chosenWeapon = computed(() => equipmentWeapon(this.chosenEquipment()));
  readonly chosenBattalion = linkedSignal<Battalion | null>(() => this.battalion());
  readonly abilityPickerOpen = signal(false);
  readonly battalionPickerOpen = signal(false);

  readonly battalions = toSignal(this.api.getBattalions(), { initialValue: [] as Battalion[] });
  readonly battalionGroups = computed(() =>
    BATTALION_TYPE_ORDER.map((type) => ({ type, battalions: this.battalions().filter((battalion) => battalion.type === type) })),
  );

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => !ability.upgradeOf && this.abilityNames().includes(abilityFamily(ability))),
  );
  readonly equippedAbilityNames = computed(() => abilitiesAt(this.equippedAbilities(), this.endLevel()).map((ability) => ability.name));
  readonly selectedAbilityFamilies = computed(() => abilitiesAt(this.equippedAbilities(), this.endLevel()).map(abilityFamily));
  readonly personalWeapon = computed(() => usesWeapon(this.unit().name, this.endLevel(), []));

  onAbilitiesConfirmed(names: string[]): void {
    this.abilityNames.set(names);
    this.abilityPickerOpen.set(false);
  }

  setBattalion(value: string): void {
    this.chosenBattalion.set(this.battalions().find((battalion) => String(battalion.id) === value) ?? null);
  }

  readonly closed = output<void>();
  readonly back = output<void>();
  readonly saveTransfer = signal(false);
  private readonly saves = inject(ProjectionSaveStorageService);
  private readonly transferTransactionId = this.saves.transactionIdForTransfer();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  readonly planEditor = viewChild(ClassPlanComponent);

  private readonly steps = computed(() => {
    const planned = this.plannedSteps() ?? this.planEditor()?.steps() ?? [];
    const history = this.history();

    return history ? [...history.steps.filter((step) => step.fromLevel < this.startLevel()), ...planned] : planned;
  });

  readonly page = signal<'plan' | 'results'>('plan');
  readonly chapterNumber = signal<number | null>(null);
  readonly endLevel = signal(MAX_PROJECTION_LEVEL);

  readonly chapter = computed<RecruitmentChapter | null>(
    () => this.chapters().find((candidate) => candidate.chapter === this.chapterNumber()) ?? this.chapters().at(0) ?? null,
  );

  readonly startLevel = computed(() => this.chapter()?.level ?? 1);

  readonly firstLevel = computed(() => this.history()?.start.level ?? this.startLevel());

  readonly actualAtEnd = computed(() => this.actuals().find((actual) => actual.level === this.endLevel()) ?? null);

  readonly actualLevels = computed(() => this.actuals().map((actual) => actual.level).sort((a, b) => a - b));

  ngOnInit(): void {
    this.chapterNumber.set(this.initialChapter() ?? this.chapters()[0]?.chapter ?? null);

    if (this.plannedSteps()) {
      this.page.set('results');
    }
  }

  goBack(): void {
    if (this.plannedSteps()) {
      this.back.emit();
    } else {
      this.page.set('plan');
    }
  }

  private readonly endStep = computed(() => stepAtLevel(this.steps(), this.endLevel()));

  readonly endClass = computed(() => this.endStep()?.unitClass ?? null);

  readonly endMount = computed(() => {
    const step = this.endStep();

    return step?.mount ? { name: step.mount.name, bondLevel: step.bondLevel } : null;
  });

  readonly mountedAtEnd = computed(() => {
    const unitClass = this.endClass();

    return unitClass !== null && isMountedClass(unitClass.name);
  });

  readonly projection = computed(() => {
    const chapter = this.chapter();
    const from = this.history()?.start ?? chapter;

    if (!chapter || !from) {
      return [];
    }

    const unit = this.unit();
    const steps = this.steps();
    const end = Math.max(this.firstLevel(), this.endLevel());
    const projected = projectStats(from.stats, from.level, end, (level) => {
      const step = stepAtLevel(steps, level);

      return step ? levelUpGrowth(unit, step.unitClass, level, step.mount, step.bondLevel) : null;
    }, (level) => {
      const entries = this.boosterHistory().filter((entry) => entry.level === level);
      return entries.reduce((stats, entry) => {
        const gains = boosterStats(entry.counts);
        this.statKeys.forEach((stat) => stats[stat] += gains[stat]);
        return stats;
      }, boosterStats({}));
    });
    const additional = boosterStats(this.boosters());
    this.statKeys.forEach((stat) => projected[stat] = Math.min(MAX_BASE_STATS[stat], projected[stat] + additional[stat]));
    const step = this.endStep();
    const bonusWith = (gear: InGameGear) =>
      inGameBonus(unit.name, end, step?.unitClass ?? null, step?.mount ?? null, step?.bondLevel ?? null, gear);
    const shown = bonusWith({ equipment: this.chosenEquipment(), abilities: this.equippedAbilities(), weapon: this.chosenWeapon(), battalion: this.chosenBattalion() });
    const enteredWith = bonusWith({ equipment: this.equipment(), abilities: this.abilities(), weapon: this.weapon(), battalion: this.battalion() });
    const inGame = this.view() === 'inGame';
    const actual = this.actuals().find((candidate) => candidate.level === end) ?? null;
    const showActual = actual !== null;

    return this.statKeys.map((stat) => {
      const classBonus = step?.unitClass.bonusStats[stat] ?? 0;
      const total = projected[stat] + (inGame ? shown[stat] : 0);
      const entered = showActual ? actual.stats[stat] : null;
      const shownActual =
        entered === null ? null : entered - (actual!.inGame ? enteredWith[stat] : 0) + (inGame ? shown[stat] : 0);
      const appliedClass = inGame ? classBonus : 0;
      const modifier = inGame ? shown[stat] - classBonus : 0;

      return {
        stat,
        label: this.statLabels[stat],
        base: projected[stat],
        bonus: classBonus,
        extraBonus: shown[stat] - classBonus,
        total,
        boosted: hasStatBonus(modifier),
        detail: statBreakdown(this.fixed(projected[stat]), appliedClass, modifier),
        actualDetail: shownActual === null ? '' :
          statBreakdown(shownActual - appliedClass - modifier, appliedClass, modifier),
        actual: shownActual,
        tone: shownActual === null ? null : actualTone(shownActual, total),
      };
    });
  });

  submit(): void {
    this.endLevel.set(this.maxLevel);
    this.page.set('results');
  }

  finish(): void {
    if (this.saveTransfer()) {
      const start = this.transferStart();
      if (start) this.saves.transfer(start);
    }
    this.closed.emit();
  }

  private transferStart(): ProjectionStart | null {
    const source = this.transferSource();
    if (source) {
      return {
        ...structuredClone(source),
        equipment: [...this.chosenEquipment()],
        abilities: this.equippedAbilities(),
        battalion: this.chosenBattalion(),
        weapon: this.chosenWeapon(),
        options: { ...source.options, level: this.endLevel() },
      };
    }

    const from = this.history()?.start ?? this.chapter();
    const steps = this.steps();
    if (!from || steps.length === 0) return null;
    const boosterCounts = sumBoosters(
      ...this.boosterHistory().map((entry) => entry.counts),
      this.boosters(),
    );
    const actual = this.actuals().find((entry) => entry.level === this.endLevel()) ?? null;

    return {
      transactionId: this.transferTransactionId,
      source: 'manual',
      unit: this.unit(),
      name: this.unit().name,
      level: from.level,
      className: from.className,
      stats: { ...from.stats },
      chapters: [],
      routeKey: null,
      chapterNumber: null,
      baseStats: false,
      boosters: boosterCounts,
      equipment: [...this.chosenEquipment()],
      inGameStats: false,
      actual,
      actuals: [...this.actuals()],
      abilities: this.equippedAbilities(),
      weapon: this.chosenWeapon(),
      battalion: this.chosenBattalion(),
      plan: steps.map((step, index) => ({
        id: index + 1,
        classId: step.unitClass.id,
        fromLevel: step.fromLevel,
        mountId: step.mount?.id ?? null,
        bondLevel: step.bondLevel,
      })),
      steps,
      options: { ...DEFAULT_PROJECTION_OPTIONS, level: this.endLevel() },
    };
  }

  setEndLevel(value: string): void {
    const level = Math.round(Number(value));

    if (Number.isFinite(level)) {
      this.endLevel.set(Math.min(this.maxLevel, Math.max(this.firstLevel(), level)));
    }
  }

  fixed(value: number): string {
    return value.toFixed(2);
  }

  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.abilityPickerOpen() || this.equipmentPickerOpen() || this.boosterPickerOpen() || this.battalionPickerOpen()) {
      return;
    }

    this.closed.emit();
  }
}

export function actualTone(actual: number, projected: number): ActualTone {
  const expected = Math.floor(projected);

  return actual > expected ? 'higher' : actual < expected ? 'lower' : 'even';
}
