import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { portraitUrl, skillIconUrl, useFallbackIcon } from '../icon-links';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { BOOSTED_GROWTH_VARIANTS, characterKey, classLabel, diffGrowth, growthTotal, Mount, SKILL_KEYS, SKILL_LABELS, SkillKey, SkillPreference, STAT_KEYS, STAT_LABELS, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { BASE_MOVE, buildFromStrength, chapterGrowth, RouteRequirement } from '../models/recruitment.models';
import { CalculatorStateService } from '../services/calculator-state.service';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { StatRowItem, StatRowsComponent } from '../stat-rows/stat-rows.component';
import { SkillGridComponent } from '../skill-grid/skill-grid.component';
import { ItemCardComponent } from '../item-card/item-card.component';
import { hasStatBonus, statBreakdown } from '../models/stat-display';
import { blazeBonusOf, MAX_EXTRA_BONUS } from '../models/bonuses';

type Tone = 'positive' | 'negative' | 'zero' | 'base';

type Pill = StatRowItem;

type CharacterTab = 'build' | 'skill' | 'recruitment' | 'blaze';

const SKILL_ICON_COLORS: Record<SkillPreference, string> = { good: 'gold', neutral: 'black', bad: 'silver' };

@Component({
  selector: 'app-character-page',
  imports: [GrowthCalculatorComponent, ItemCardComponent, NgTemplateOutlet, ProjectionDialogComponent, RouterLink, SkillGridComponent, StatRowsComponent],
  templateUrl: './character-page.component.html',
  styleUrls: ['../styles/detail-cards.scss', './character-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly recruitmentData = inject(RecruitmentDataService);
  private readonly state = inject(CalculatorStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly panels = viewChildren(GrowthCalculatorComponent);

  readonly tabs = computed(() => [
    { key: 'build' as const, label: 'Build' },
    { key: 'skill' as const, label: 'Skill' },
    { key: 'recruitment' as const, label: 'Recruitment' },
    ...(this.recruitment()?.blaze ? [{ key: 'blaze' as const, label: 'Blaze' }] : []),
  ]);

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly classLabel = classLabel;

  private readonly units = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });

  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  private readonly mounts = toSignal(this.api.getMounts(), {
    initialValue: [] as Mount[],
  });

  readonly defaultClassId = computed(
    () => this.classes().find((c) => c.name === 'Noble/Commoner')?.id ?? null,
  );

  readonly unitId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );

  readonly unit = computed(
    () => this.units().find((u) => u.id === this.unitId()) ?? null,
  );

  readonly activeTab = linkedSignal<number, CharacterTab>({
    source: this.unitId,
    computation: () => 'build',
  });

  readonly recruitment = computed(() => {
    const unit = this.unit();

    return unit ? this.recruitmentData.forUnit(unit.name) : null;
  });

  readonly routes = computed(() => this.recruitment()?.routes.filter((route) => route.chapters.length > 0) ?? []);

  readonly activeRouteKey = linkedSignal<readonly { key: string }[], string | null>({
    source: this.routes,
    computation: (routes, previous) =>
      routes.find((route) => route.key === previous?.value)?.key ?? routes[0]?.key ?? null,
  });

  readonly activeRoute = computed(
    () => this.routes().find((route) => route.key === this.activeRouteKey()) ?? null,
  );

  readonly selectedChapter = linkedSignal(() => this.activeRoute()?.chapters[0]?.chapter ?? null);

  readonly chapter = computed(
    () => this.activeRoute()?.chapters.find((chapter) => chapter.chapter === this.selectedChapter()) ?? null,
  );

  readonly chapterView = computed(() => {
    const chapter = this.chapter();
    const unit = this.unit();

    if (!chapter || !unit) {
      return null;
    }

    const unitClass = this.classes().find((candidate) => candidate.name === chapter.className) ?? null;
    const classMountType = this.api.mountTypeOfClass(chapter.className);
    const blaze = blazeBonusOf(unit.name);
    const modifiers = toGrowth(Object.fromEntries(STAT_KEYS.map((stat) =>
      [stat, Math.min(MAX_EXTRA_BONUS, blaze[stat])],
    )));
    const chapterStats = sumGrowth(chapter.stats, toGrowth(unitClass?.bonusStats ?? null), modifiers);
    const strength = chapterStats.str;
    const stats: Pill[] = STAT_KEYS.filter((stat) => stat !== 'hp')
      .map((stat) => ({
        label: STAT_LABELS[stat], value: String(chapterStats[stat]), tone: 'base',
        boosted: hasStatBonus(modifiers[stat]),
        detail: statBreakdown(chapter.stats[stat], unitClass?.bonusStats[stat] ?? 0, modifiers[stat]),
      }));
    const profile: Pill[] = [
      { label: STAT_LABELS.hp, value: String(chapterStats.hp), tone: 'base', wide: true,
        boosted: hasStatBonus(modifiers.hp),
        detail: statBreakdown(chapter.stats.hp, unitClass?.bonusStats.hp ?? 0, modifiers.hp) },
      { label: 'Lv', value: String(chapter.level), tone: 'base', wide: true },
      { label: 'Mov', value: unitClass ? String(BASE_MOVE + unitClass.bonusStats.mov) : '—', tone: 'base',
        detail: statBreakdown(unitClass ? BASE_MOVE : '—', unitClass?.bonusStats.mov ?? 0) },
      { label: 'Bld', value: String(buildFromStrength(strength)), tone: 'base' },
    ];
    const { growthUnit, baseUnit } = this.growthUnitsFor(unit);
    const growth = unitClass
      ? chapterGrowth(growthUnit, unitClass, classMountType, this.mounts())
      : null;
    const bonus = baseUnit ? diffGrowth(toGrowth(growthUnit), toGrowth(baseUnit)) : null;

    return {
      chapter,
      unitClass,
      profile,
      inventory: chapter.inventory.filter((group) => group.label !== 'Combat Arts'),
      combatArts: chapter.inventory.find((group) => group.label === 'Combat Arts') ?? null,
      stats,
      growth: growth
        ? STAT_KEYS.map((stat) => ({
            label: STAT_LABELS[stat],
            value: `${growth.growth[stat]}%`,
            tone: toneOf(growth.growth[stat]),
            boosted: hasStatBonus(bonus?.[stat] ?? 0),
            wide: stat === 'hp',
            detail:
              baseUnit && bonus && bonus[stat] !== 0
                ? `Base: ${growth.growth[stat] - bonus[stat]}% + Bonus: ${bonus[stat]}%`
                : undefined,
          }))
        : [],
      growthTotal: growth ? growthTotal(growth.growth) : null,
      mount: growth?.mount ?? null,
      skillRanks: SKILL_KEYS.filter((skill) => chapter.skillRanks[skill]).map((skill) => ({
        key: skill,
        label: SKILL_LABELS[skill],
        value: chapter.skillRanks[skill]!,
        preference: unit.skillPreference[skill],
        usable: !!unitClass && (unitClass.skills[skill] || (skill === 'authority' && classMountType === 'None')),
      })),
    };
  });

  readonly projectionOpen = signal(false);

  readonly projectionUnit = computed(() => {
    const unit = this.unit();

    return unit ? this.api.withGrowthBonus(unit) : null;
  });

  readonly slotA = computed(() => `character-${this.unitId()}-1`);
  readonly slotB = computed(() => `character-${this.unitId()}-2`);

  private growthUnitsFor(unit: Unit): { growthUnit: Unit; baseUnit: Unit | null } {
    const key = characterKey(unit.name);
    const boosted = this.units().find((candidate) => candidate.name === BOOSTED_GROWTH_VARIANTS[key]);
    const base = this.units().find((candidate) => candidate.name === key);

    return boosted && base ? { growthUnit: boosted, baseUnit: base } : { growthUnit: unit, baseUnit: null };
  }

  readonly comparing = linkedSignal(() => this.state.has(this.slotB()));

  readonly difference = computed(() => {
    const [a, b] = this.panels();

    if (!this.comparing() || !a || !b) {
      return null;
    }

    const buildA = a.build();
    const buildB = b.build();
    const growth = diffGrowth(buildB.total, buildA.total);

    return {
      growth,
      total: growthTotal(growth),
      labelA: buildA.unitClass?.name ?? 'No Class',
      labelB: buildB.unitClass?.name ?? 'No Class',
    };
  });

  skillIcon(skill: SkillKey, preference: SkillPreference): string {
    return `icons/skills/${SKILL_ICON_COLORS[preference]}/${skill}.svg`;
  }

  linkedSkillIcon(skill: SkillKey, preference: SkillPreference): string {
    return skillIconUrl(skill, preference) ?? this.skillIcon(skill, preference);
  }

  readonly useFallbackIcon = useFallbackIcon;

  readonly portraitFailed = linkedSignal({ source: () => this.unit()?.name, computation: () => false });

  readonly portrait = computed(() => {
    const name = this.unit()?.name;

    return name && !this.portraitFailed() ? portraitUrl(name) : null;
  });

  selectTab(tab: CharacterTab): void {
    this.activeTab.set(tab);
  }

  selectRoute(key: string): void {
    this.activeRouteKey.set(key);
  }

  selectChapter(value: string): void {
    this.selectedChapter.set(Number(value));
  }

  requirementText(requirement: RouteRequirement): string {
    return [
      requirement.negotiation,
      requirement.supportLevel > 0 ? `Support Lv ${requirement.supportLevel}` : '',
      requirement.renownLevel > 0 ? `Renown Lv ${requirement.renownLevel}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  startCompare(): void {
    this.state.set(this.slotB(), {
      unitId: this.unitId(),
      classId: this.defaultClassId(),
      mountId: null,
      mountLevel: null,
      classLevel: null,
    });
    this.comparing.set(true);
  }

  stopCompare(): void {
    this.state.clear(this.slotB());
    this.comparing.set(false);
  }
}

function toneOf(value: number): Tone {
  if (value > 0) {
    return 'positive';
  }

  return value < 0 ? 'negative' : 'zero';
}