import { TestBed } from '@angular/core/testing';
import { PlanStep } from '../class-plan/class-plan.component';
import unitClassData from '../data/unit-classes.json';
import { baseStatsOf, GrowthRates, MAX_BASE_STATS, STAT_KEYS, StatKey, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { blazeBonusOf } from '../models/bonuses';
import { ITEMS } from '../models/equipment';
import { levelUpGrowth, projectStats } from '../models/recruitment.models';
import { ProjectionOptions, ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { BuildResult, ProjectionBuildComponent } from './projection-build.component';

const classes = unitClassData as UnitClass[];
const byName = (name: string) => classes.find((unitClass) => unitClass.name === name)!;
const options: ProjectionOptions = { level: 30, minimum: false, partOneEndLevel: 1, wideRange: false };
const stepsFrom = (level: number, ...reclasses: [number, string][]): PlanStep[] => [
  { fromLevel: level, unitClass: byName('Noble/Commoner'), mount: null, bondLevel: null },
  ...reclasses.map(([fromLevel, name]) => ({ fromLevel, unitClass: byName(name), mount: null, bondLevel: null })),
];

describe('ProjectionBuildComponent', () => {
  let units: Unit[];

  beforeEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(false);
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (units = loaded));
  });

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const chapterStart = (name: string): ProjectionStart => {
    const route = TestBed.inject(RecruitmentDataService).routesWithChapters(name)[0];
    const chapter = route.chapters[0];

    return {
      source: 'chapter',
      unit: units.find((unit) => unit.name === name)!,
      name,
      level: chapter.level,
      className: chapter.className,
      stats: chapter.stats,
      chapters: route.chapters,
      routeKey: route.key,
      chapterNumber: chapter.chapter,
      baseStats: false,
      plan: [],
      steps: stepsFrom(chapter.level),
      options,
    };
  };

  const manualStart = (name: string, level: number, stats: GrowthRates): ProjectionStart => ({
    source: 'manual',
    unit: units.find((unit) => unit.name === name)!,
    name,
    level,
    className: null,
    stats,
    chapters: [],
    routeKey: null,
    chapterNumber: null,
    baseStats: false,
    plan: [],
    steps: stepsFrom(level),
    options,
  });

  const open = (start: ProjectionStart, changes: Partial<ProjectionOptions> = {}) => {
    const fixture = TestBed.createComponent(ProjectionBuildComponent);
    let result: BuildResult | null = null;
    fixture.componentRef.setInput('heading', start.name);
    fixture.componentRef.setInput('start', { ...start, options: { ...start.options, ...changes } });
    fixture.componentInstance.resultChange.subscribe((emitted) => (result = emitted));
    fixture.detectChanges();

    return { fixture, build: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, result: () => result };
  };

  it('switches between stat boosters in Base and the stat increase menu in In-game', () => {
    const { fixture, host } = open(chapterStart('Cai'));
    const toolbar = host.querySelector('.view-bar')!;
    expect(toolbar.querySelector('app-stat-increase-menu')).not.toBeNull();
    expect(Array.from(toolbar.querySelectorAll<HTMLButtonElement>(':scope > button'))
      .some((button) => button.textContent!.trim() === 'Stat boosters')).toBeFalse();
    const items = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('app-stat-increase-menu button'))
      .find((button) => button.textContent!.trim() === 'Items')!;
    items.click();
    fixture.detectChanges();
    expect(host.querySelector('app-stat-booster-dialog')).not.toBeNull();
    fixture.componentInstance.boosterPickerOpen.set(false);
    fixture.componentInstance.view.set('base');
    fixture.detectChanges();
    expect(toolbar.querySelector('app-stat-increase-menu')).toBeNull();
    const button = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
      .find((entry) => entry.textContent!.trim() === 'Stat boosters')!;
    button.click();
    fixture.detectChanges();
    expect(host.querySelector('app-stat-booster-dialog')).not.toBeNull();
    fixture.componentInstance.boosterPickerOpen.set(false);
    fixture.componentInstance.view.set('inGame');
    fixture.detectChanges();
    expect(toolbar.querySelector('app-stat-increase-menu')).not.toBeNull();
  });

  describe('equipment bonuses', () => {
    const sword = ITEMS.find((item) => item.Name === 'Wooden Sword')!;
    const original = sword.BonusStats;
    beforeEach(() => { sword.BonusStats = [{ Spd: 4 }]; });
    afterEach(() => { sword.BonusStats = original; });

    it('caps the base distribution before applying class and shared non-class bonuses', () => {
      sword.BonusStats = [{ Str: 20 }];
      const start = manualStart('Lysander', 10, { ...MAX_BASE_STATS });
      start.steps = [{ fromLevel: 10, unitClass: byName('Gladiator'), mount: null, bondLevel: null }];
      const { build, fixture, result } = open(start, { level: 30, minimum: true });
      build.onEquipmentConfirmed([sword.Name]);
      fixture.detectChanges();
      const strength = () => build.rows().find((row) => row.stat === 'str')!;
      expect(strength().summary.mean).toBe(99 + byName('Gladiator').bonusStats.str + 10);
      expect(result()!.totals.str.probs).toEqual([1]);
      build.view.set('base');
      fixture.detectChanges();
      expect(strength().summary.mean).toBe(99);
      expect(build.totals()!.hp.min).toBe(120);
      for (const stat of STAT_KEYS) {
        expect(build.totals()![stat].min).toBe(MAX_BASE_STATS[stat]);
        expect(build.totals()![stat].probs).toEqual([1]);
      }
    });

    it('adds boosters to provided base stats, but not again to manually entered stats', () => {
      const stats = { ...baseStatsOf('Cai')!, str: 10 };
      const start = { ...manualStart('Cai', 1, stats), baseStats: true, boosters: { str: 3 } };
      const { fixture, build } = open(start, { level: 1 });
      build.view.set('base');
      expect(build.totals()!.str.min).toBe(16);
      fixture.componentRef.setInput('start', { ...start, baseStats: false, stats: { ...stats, str: 16 }, options: { ...options, level: 1 } });
      fixture.detectChanges();
      expect(build.totals()!.str.min).toBe(16);
    });

    it('includes booster gains in actual-stat distributions at the actual level without altering the observed value', () => {
      const start = chapterStart('Cai');
      start.boosters = { str: 3 };
      start.actual = { level: start.level, stats: { ...start.stats, str: start.stats.str + 6 }, inGame: false };
      const { build } = open(start, { level: start.level });
      build.view.set('base');
      const strength = build.rows().find((row) => row.stat === 'str')!;
      expect(strength.summary.mean).toBe(start.stats.str + 6);
      expect(strength.actual).toBe(start.stats.str + 6);
      expect(strength.tone).not.toBe('impossible');
    });

    it('adds and removes equipment in game without changing base stats or growth', () => {
      const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
      const { build, fixture, result } = open(manualStart('Lysander', 10, stats), { level: 10 });
      const speed = () => build.rows().find((row) => row.stat === 'spd')!;
      const growth = speed().growthRate;
      build.onEquipmentConfirmed([sword.Name]);
      fixture.detectChanges();
      expect(speed().summary.mean).toBe(24);
      expect(speed().boosted).toBeTrue();
      expect(speed().detail).toBe('Base Value 20.00; Class +0; Modifier +4');
      expect(speed().growthRate).toBe(growth);
      expect(result()!.totals.spd.min).toBe(24);
      build.view.set('base');
      expect(speed().summary.mean).toBe(20);
      expect(speed().boosted).toBeFalse();
      expect(speed().detail).toBe('Base Value 20.00; Class +0; Modifier +0');
      build.view.set('inGame');
      build.onEquipmentConfirmed([]);
      expect(speed().summary.mean).toBe(20);
    });

    it('subtracts starting equipment from entered in-game stats and keeps the original baseline after unequipping', () => {
      const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
      const { build } = open({
        ...manualStart('Lysander', 10, stats), inGameStats: true, equipment: [sword.Name],
      }, { level: 10 });
      const speed = () => build.rows().find((row) => row.stat === 'spd')!.summary.mean;
      expect(speed()).toBe(20);
      build.view.set('base');
      expect(speed()).toBe(16);
      build.view.set('inGame');
      build.onEquipmentConfirmed([]);
      expect(speed()).toBe(16);
    });
  });

  it("averages what the existing projection does from a chapter, plus the class's bonus and Cai's Blaze", () => {
    const start = chapterStart('Cai');
    const { build, result } = open(start);
    const noble = byName(start.className!);
    const blaze = blazeBonusOf('Cai');
    const average = projectStats(start.stats, start.level, 30, (level) => levelUpGrowth(start.unit, noble, level, null, null));

    expect(blaze.mag).toBe(3);
    for (const row of build.rows()) {
      expect(row.summary.mean).toBeCloseTo(average[row.stat] + noble.bonusStats[row.stat] + blaze[row.stat], 10);
    }
    expect(result()!.level).toBe(30);
    expect(result()!.label).toBe('Cai');
  });

  it('projects manual stats the same way as chapter stats', () => {
    const start = chapterStart('Cai');
    const shown = Object.fromEntries(STAT_KEYS.map((stat) => [stat, start.stats[stat]])) as GrowthRates;
    const fromChapter = open(start).build.rows().map((row) => row.summary.mean);
    const fromManual = open(manualStart('Cai', start.level, shown)).build.rows().map((row) => row.summary.mean);

    fromManual.forEach((mean, index) => expect(mean).toBeCloseTo(fromChapter[index], 10));
  });

  it('applies the starting class floor and bonus to manual Lv 1 base stats', () => {
    const start = {
      ...manualStart('Lysander', 1, baseStatsOf('Lysander')!),
      baseStats: true,
      steps: [{ fromLevel: 1, unitClass: byName('Ornius Rider'), mount: null, bondLevel: null }],
      options: { ...options, level: 1 },
    };
    const { build } = open(start);
    const speed = build.rows().find((row) => row.stat === 'spd')!;

    expect(speed.summary.mean).toBe(11);
  });

  it('adds the starting class bonus to manual stats entered at a later level', () => {
    const trooper = byName('Celestial Trooper');
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 40])) as GrowthRates;
    const start = {
      ...manualStart('Lysander', 68, stats),
      steps: [{ fromLevel: 68, unitClass: trooper, mount: null, bondLevel: null }],
      options: { ...options, level: 68 },
    };
    const { build } = open(start);

    for (const row of build.rows()) {
      expect(row.summary.mean).toBe(Math.max(40, trooper.classFloorStats[row.stat]) + trooper.bonusStats[row.stat]);
    }
  });

  it('shows the active class growth rate at the selected level', () => {
    const start = chapterStart('Cai');
    const activeClass = byName('The Eternal');
    const { build, host } = open({ ...start, steps: stepsFrom(start.level, [20, activeClass.name]) }, { level: 21 });
    const strength = build.rows().find((row) => row.stat === 'str')!;
    const expected = levelUpGrowth(start.unit, activeClass, 21, null, null).str;

    expect(strength.growthRate).toBe(expected);
    expect(host.querySelector('.row-growth')!.textContent!.trim()).toBe(`${expected}%`);
  });

  it('takes the starting class, mount and equipped abilities off in-game manual stats', () => {
    const rider = byName('Ornius Rider');
    const insight = { name: 'Divine Insight', description: '', boosts: { spd: 10 } };
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 40])) as GrowthRates;
    const start = {
      ...manualStart('Lysander', 20, stats),
      inGameStats: true,
      abilities: [insight],
      steps: [
        { fromLevel: 20, unitClass: rider, mount: null, bondLevel: null },
        { fromLevel: 21, unitClass: byName('Noble/Commoner'), mount: null, bondLevel: null },
        { fromLevel: 50, unitClass: byName('The Blade'), mount: null, bondLevel: null },
      ],
    };
    const spd = (level: number, view: 'base' | 'inGame' = 'inGame') => {
      const { build } = open(start, { level });
      build.view.set(view);

      return build.rows().find((row) => row.stat === 'spd')!.summary;
    };

    expect(spd(20, 'base').mean).toBe(40 - 10 - rider.bonusStats.spd);
    expect(spd(20).mean).toBe(40);
    expect(spd(21).low).toBe(40 - rider.bonusStats.spd);
  });

  it('switches between base and in-game views, with equipped abilities only in game', () => {
    const rider = byName('Ornius Rider');
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
    const start = {
      ...manualStart('Lysander', 10, stats),
      steps: [{ fromLevel: 10, unitClass: rider, mount: null, bondLevel: null }, { fromLevel: 50, unitClass: byName('The Blade'), mount: null, bondLevel: null }],
      options: { ...options, level: 10 },
    };
    const { build, fixture, result } = open(start);
    const spd = () => build.rows().find((row) => row.stat === 'spd')!.summary.mean;

    expect(spd()).toBe(20 + rider.bonusStats.spd);
    build.onAbilitiesConfirmed(['Divine Insight']);
    expect(spd()).toBe(30 + rider.bonusStats.spd);

    build.view.set('base');
    expect(spd()).toBe(20);
    fixture.detectChanges();
    expect(result()!.totals.spd.min).toBe(30 + rider.bonusStats.spd);
  });

  it('places in-game actuals from the build dialog in both views', () => {
    const rider = byName('Ornius Rider');
    const insight = { name: 'Divine Insight', description: '', boosts: { spd: 10 } };
    const actualStats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, stat === 'spd' ? 30 : null]));
    const start = {
      ...manualStart('Lysander', 1, baseStatsOf('Lysander')!),
      baseStats: true,
      actual: { level: 10, stats: actualStats as Record<StatKey, number | null>, inGame: true },
      abilities: [insight],
      steps: [{ fromLevel: 1, unitClass: rider, mount: null, bondLevel: null }, { fromLevel: 50, unitClass: byName('The Blade'), mount: null, bondLevel: null }],
      options: { ...options, level: 10 },
    };
    const { build } = open(start);
    const spd = () => build.rows().find((row) => row.stat === 'spd')!;

    expect(spd().actual).toBe(30);
    expect(build.rows().find((row) => row.stat === 'str')!.actual).toBeNull();

    build.view.set('base');
    expect(spd().actual).toBe(30 - 10 - rider.bonusStats.spd);
    expect(spd().rank).not.toBeNull();

    expect(open(start, { level: 11 }).build.rows().every((row) => row.actual === null)).toBeTrue();
  });

  it('adds bonuses to base actuals and subtracts them from in-game actuals without changing entered gear', () => {
    const sword = ITEMS.find((item) => item.Name === 'Wooden Sword')!;
    const original = sword.BonusStats;
    sword.BonusStats = [{ Str: 4 }];
    try {
      const noble = byName('Noble/Commoner');
      const actualStats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, stat === 'str' ? 30 : null])) as Record<StatKey, number | null>;
      const start = {
        ...manualStart('Lysander', 1, baseStatsOf('Lysander')!),
        baseStats: true,
        equipment: ['Wooden Sword'],
        steps: [{ fromLevel: 1, unitClass: noble, mount: null, bondLevel: null }],
        actual: { level: 10, stats: actualStats, inGame: false },
      };
      const base = open(start, { level: 10 }).build;
      const row = () => base.rows().find((candidate) => candidate.stat === 'str')!;
      expect(row().actual).toBe(30 + noble.bonusStats.str + 4);
      base.view.set('base');
      expect(row().actual).toBe(30);
      base.onEquipmentConfirmed([]);
      base.view.set('inGame');
      expect(row().actual).toBe(30 + noble.bonusStats.str);

      const enteredInGame = open({ ...start, actual: { ...start.actual, inGame: true } }, { level: 10 }).build;
      const inGameRow = () => enteredInGame.rows().find((candidate) => candidate.stat === 'str')!;
      expect(inGameRow().actual).toBe(30);
      enteredInGame.view.set('base');
      expect(inGameRow().actual).toBe(30 - noble.bonusStats.str - 4);
      enteredInGame.onEquipmentConfirmed([]);
      enteredInGame.view.set('inGame');
      expect(inGameRow().actual).toBe(26);
    } finally {
      sword.BonusStats = original;
    }
  });

  it('applies theoretical equipment to projections without actual stats only in the in-game view', () => {
    const sword = ITEMS.find((item) => item.Name === 'Wooden Sword')!;
    const original = sword.BonusStats;
    sword.BonusStats = [{ Str: 4 }];
    try {
      const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
      const start = { ...manualStart('Lysander', 10, stats), equipment: ['Wooden Sword'] };
      const { build } = open(start, { level: 10 });
      const row = () => build.rows().find((candidate) => candidate.stat === 'str')!;
      const inGame = row().summary.mean;
      expect(row().actual).toBeNull();
      build.view.set('base');
      expect(inGame - row().summary.mean).toBe(byName('Noble/Commoner').bonusStats.str + 4);
    } finally {
      sword.BonusStats = original;
    }
  });

  it('lines up every growth rate and bar, whatever the values', () => {
    const { fixture, host } = open(chapterStart('Cai'), { wideRange: true });
    fixture.detectChanges();
    const edges = (selector: string, edge: (box: DOMRect) => number) =>
      new Set(Array.from(host.querySelectorAll(selector)).map((element) => Math.round(edge(element.getBoundingClientRect()))));

    expect(edges('.row-growth', (box) => box.left).size).toBe(1);
    expect(edges('.row-bar', (box) => box.left).size).toBe(1);
    expect(edges('.row-bar', (box) => box.width).size).toBe(1);
  });

  it('counts a battalion in game only while the class is not mounted', () => {
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
    const hunters = { id: 1, name: 'Novice Hunters', type: 'Physical' as const, rank: 'E', total: 5, skillName: '', skillDescription: '', ...stats, str: 1, dex: 1, cha: 3, hp: 0, mag: 0, spd: 0, def: 0, res: 0, lck: 0 };
    const strIn = (className: string) => {
      const unitClass = byName(className);
      const { build } = open(
        { ...manualStart('Lysander', 10, stats), battalion: hunters, steps: [{ fromLevel: 10, unitClass, mount: null, bondLevel: null }] },
        { level: 10 },
      );

      return build.rows().find((row) => row.stat === 'str')!.summary.mean - unitClass.bonusStats.str;
    };

    expect(strIn('Noble/Commoner')).toBe(21);
    expect(strIn('Ornius Rider')).toBe(20);
  });

  it('suppresses an assigned battalion throughout a mounted period and restores it after reclassing', () => {
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
    const battalion = { ...toGrowth({ str: 2 }), id: 1, name: 'Test', type: 'Physical' as const, rank: 'E', total: 2, skillName: '', skillDescription: '' };
    const rider = byName('Ornius Rider');
    const noble = byName('Noble/Commoner');
    const start = { ...manualStart('Lysander', 10, stats), battalion, steps: [
      { fromLevel: 10, unitClass: rider, mount: null, bondLevel: null },
      { fromLevel: 31, unitClass: noble, mount: null, bondLevel: null },
    ] };
    const modifier = (level: number) => {
      const { build } = open(start, { level });
      const inGame = build.rows().find((row) => row.stat === 'str')!.summary.mean;
      build.view.set('base');
      return inGame - build.rows().find((row) => row.stat === 'str')!.summary.mean -
        (level < 31 ? rider : noble).bonusStats.str;
    };
    [10, 20, 30].forEach((level) => expect(modifier(level)).toBeCloseTo(0, 10));
    [31, 32].forEach((level) => expect(modifier(level)).toBeCloseTo(2, 10));
  });

  it("counts Mu's Warrior's Blood picked at Lv 20 as Warrior's Blood+ from Lv 35", () => {
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
    const blood = { name: "Warrior's Blood", description: '', boosts: {}, learnedAt: 20 };
    const start = { ...manualStart('Mu', 20, stats), steps: stepsFrom(20), abilities: [blood], equipment: ['Wooden Sword'] };
    const extra = (level: number, stat: StatKey) => {
      const { build } = open(start, { level });
      const inGame = build.rows().find((row) => row.stat === stat)!.summary.mean;
      build.view.set('base');

      return Math.round(inGame - build.rows().find((row) => row.stat === stat)!.summary.mean);
    };

    expect([extra(34, 'spd'), extra(34, 'dex')]).toEqual([2, 0]);
    expect([extra(35, 'spd'), extra(35, 'dex')]).toEqual([2, 2]);
  });

  it("updates Mu's bonuses when Inventory changes and ignores a legacy weapon selection", () => {
    const stats = Object.fromEntries(STAT_KEYS.map((stat) => [stat, 20])) as GrowthRates;
    const blood = { name: "Warrior's Blood", description: '', boosts: {}, learnedAt: 20 };
    const start = { ...manualStart('Mu', 35, stats), abilities: [blood], weapon: 'axe' as const };
    const { build, fixture, host } = open(start, { level: 35 });
    const extra = (stat: StatKey) => {
      const row = build.rows().find((row) => row.stat === stat)!;
      return row.summary.mean - stats[stat];
    };

    expect(extra('str')).toBe(0);
    build.onEquipmentConfirmed(['Answerer Huang']);
    expect([extra('spd'), extra('dex'), extra('str')]).toEqual([2, 2, 0]);
    build.onEquipmentConfirmed(['Wooden Gauntlets']);
    expect([extra('spd'), extra('dex'), extra('str')]).toEqual([2, 0, 2]);
    build.onEquipmentConfirmed([]);
    expect([extra('spd'), extra('dex'), extra('str')]).toEqual([0, 0, 0]);
    build.abilityPickerOpen.set(true);
    fixture.detectChanges();
    expect(host.querySelector('select[aria-label="Equipped weapon"]')).toBeNull();
    expect(host.querySelector('app-picker-dialog')!.textContent).toContain('weapon equipped in Inventory');
  });

  it("keeps the card's abilities and inventory when only its level changes, but not when the build is edited", () => {
    const original = chapterStart('Cai');
    const start = { ...original, steps: [...original.steps, { fromLevel: 50, unitClass: byName('The Blade'), mount: null, bondLevel: null }] };
    const { build, fixture } = open(start);
    build.onAbilitiesConfirmed(['Divine Insight']);
    build.onEquipmentConfirmed(['Bronze Axe']);

    fixture.componentRef.setInput('start', { ...start, options: { ...start.options, level: 40 } });
    expect(build.equippedAbilityNames()).toEqual(['Divine Insight']);
    expect(build.weapon()).toBe('axe');
    expect(build.equipment()).toEqual(['Bronze Axe']);

    fixture.componentRef.setInput('start', { ...start, abilities: [], equipment: ['Wooden Sword'] });
    expect(build.equippedAbilityNames()).toEqual([]);
    expect(build.weapon()).toBe('sword');
  });

  it('raises the averages when the guaranteed minimum is on', () => {
    const start = chapterStart('Cai');
    const total = (build: ProjectionBuildComponent) => build.rows().reduce((sum, row) => sum + row.summary.mean, 0);

    expect(total(open(start, { minimum: true, partOneEndLevel: 20 }).build)).toBeGreaterThan(total(open(start).build));
  });

  const withActual = (start: ProjectionStart, stats: Partial<Record<StatKey, number>>): ProjectionStart => ({
    ...start,
    actual: {
      level: start.options.level,
      stats: Object.fromEntries(STAT_KEYS.map((stat) => [stat, stats[stat] ?? null])) as Record<StatKey, number | null>,
      inGame: false,
    },
  });

  it('rates an actual stat against the outcomes', () => {
    const start = chapterStart('Cai');
    const str = (value: number) => open(withActual(start, { str: value })).build.rows().find((row) => row.stat === 'str')!;
    const high = open(start).build.rows().find((row) => row.stat === 'str')!.summary;

    expect(str(high.high).tone).toBe('high');
    expect(str(high.high).verdict).toMatch(/^Well above average\W+better than \d+% of outcomes$/);
    expect(str(high.low - 1).tone).toBe('impossible');
  });

  it('always shows the histogram, for the stat picked', () => {
    const { build, fixture, host } = open(chapterStart('Cai'));

    expect(host.querySelector('app-stat-histogram')).not.toBeNull();
    build.histogramStat.set('mag');
    fixture.detectChanges();
    expect(host.querySelector('figure')!.getAttribute('aria-label')).toBe('Mag distribution');
  });

  it('leaves the rarest outcomes off the histogram, but widens it to show any actual value', () => {
    const { build, fixture, host } = open(chapterStart('Cai'));
    const str = () => build.rows().find((row) => row.stat === 'str')!;
    const values = () => Array.from(host.querySelectorAll('.histogram-bar')).map((bar) => Number(bar.getAttribute('title')!.match(/Str (\d+)/)![1]));

    fixture.detectChanges();
    expect(values()[0]).toBeGreaterThan(str().summary.low);
    expect(values().at(-1)).toBeLessThan(str().summary.high);

    const withStr = open(withActual(chapterStart('Cai'), { str: 99 }));
    withStr.fixture.detectChanges();
    const shown = Array.from(withStr.host.querySelectorAll('.histogram-bar')).map((bar) => Number(bar.getAttribute('title')!.match(/Str (\d+)/)![1]));
    expect(shown.at(-1)).toBe(99);
    expect(withStr.host.querySelector('.histogram-bar--actual')!.getAttribute('title')).toContain('Str 99');
  });

  it("raises stats below a new class's floors when reclassing into it", () => {
    const start = chapterStart('Cai');
    const eternal = byName('The Eternal');
    const { build } = open({ ...start, steps: stepsFrom(start.level, [20, eternal.name]) }, { level: 21 });

    const str = build.rows().find((row) => row.stat === 'str')!;
    expect(eternal.classFloorStats.str).toBeGreaterThan(0);
    expect(str.summary.low).toBeGreaterThanOrEqual(eternal.classFloorStats.str + eternal.bonusStats.str);
    expect(build.planSummary()).toBe('Noble/Commoner → The Eternal');
  });
});
