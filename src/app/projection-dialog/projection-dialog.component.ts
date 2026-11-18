import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanStep } from '../class-plan/class-plan.component';
import { abilitiesFor, abilityPickerGroups, Battalion, BATTALION_TYPE_ORDER, classLabel, MAX_EQUIPPED_ABILITIES, StatBoostAbility, STAT_KEYS, STAT_LABELS, Unit, WeaponKey } from '../models/growth.models';
import { abilitiesAt, abilityLock, InGameGear, inGameBonus, isMountedClass, usesWeapon } from '../models/bonuses';
import { levelUpGrowth, projectStats, RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';
import { PickerDialogComponent } from '../picker-dialog/picker-dialog.component';
import { ProjectionActual } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { EquipmentDialogComponent } from '../equipment-dialog/equipment-dialog.component';
import { equipmentWeapon } from '../models/equipment';
import { hasStatBonus, statBreakdown } from '../models/stat-display';

export type ActualTone = 'higher' | 'even' | 'lower';

@Component({
  selector: 'app-projection-dialog',
  imports: [ClassPlanComponent, EquipmentDialogComponent, PickerDialogComponent],
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
  readonly actuals = input<readonly ProjectionActual[]>([]);
  readonly history = input<{ start: RecruitmentChapter; steps: readonly PlanStep[] } | null>(null);
  readonly abilities = input<readonly StatBoostAbility[]>([]);
  readonly weapon = input<WeaponKey | null>(null);
  readonly battalion = input<Battalion | null>(null);
  readonly equipment = input<readonly string[]>([]);
  readonly chosenEquipment = linkedSignal(() => this.equipment());
  readonly equipmentPickerOpen = signal(false);

  onEquipmentConfirmed(names: string[]): void {
    this.chosenEquipment.set(names);
    this.equipmentPickerOpen.set(false);
  }

  readonly view = signal<'base' | 'inGame'>('inGame');

  private readonly api = inject(GrowthDataService);
  private readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), { initialValue: [] as StatBoostAbility[] });

  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  readonly abilityOptions = computed(() => abilitiesFor(this.statBoostAbilities(), this.unit().name));
  readonly abilityGroups = computed(() => abilityPickerGroups(this.abilityOptions(), (ability) => abilityLock(ability, this.endLevel())));
  private readonly abilityNames = linkedSignal<readonly string[]>(() => this.abilities().map((ability) => ability.name));
  readonly chosenWeapon = computed(() => equipmentWeapon(this.chosenEquipment()));
  readonly chosenBattalion = linkedSignal<Battalion | null>(() => this.battalion());
  readonly abilityPickerOpen = signal(false);

  private readonly battalions = toSignal(this.api.getBattalions(), { initialValue: [] as Battalion[] });
  readonly battalionGroups = computed(() =>
    BATTALION_TYPE_ORDER.map((type) => ({ type, battalions: this.battalions().filter((battalion) => battalion.type === type) })),
  );

  readonly equippedAbilities = computed(() =>
    this.abilityOptions().filter((ability) => this.abilityNames().includes(ability.name)),
  );
  readonly equippedAbilityNames = computed(() => abilitiesAt(this.equippedAbilities(), this.endLevel()).map((ability) => ability.name));
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
    });
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
    if (this.abilityPickerOpen() || this.equipmentPickerOpen()) {
      return;
    }

    this.closed.emit();
  }
}

export function actualTone(actual: number, projected: number): ActualTone {
  const expected = Math.floor(projected);

  return actual > expected ? 'higher' : actual < expected ? 'lower' : 'even';
}
