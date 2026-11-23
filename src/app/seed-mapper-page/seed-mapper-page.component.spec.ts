import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { MAX_BASE_STATS, STAT_KEYS, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { migrateSave } from '../models/seed-save';
import { ITEMS } from '../models/equipment';
import { boosterUsage, SeedMapperStateService } from '../services/seed-mapper-state.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SeedMapperPageComponent } from './seed-mapper-page.component';

const classes = unitClassData as UnitClass[];
const unitId = (name: string) => (unitData as Pick<Unit, 'id' | 'name'>[]).find((unit) => unit.name === name)!.id;

describe('SeedMapperPageComponent starting stats', () => {
  let component: SeedMapperPageComponent;
  let state: SeedMapperStateService;

  const noble = classes.find((unitClass) => unitClass.name === 'Noble/Commoner')!;
  const gladiator = classes.find((unitClass) => unitClass.name === 'Gladiator')!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SeedMapperPageComponent],
      providers: [provideRouter([])],
    });
    component = TestBed.createComponent(SeedMapperPageComponent).componentInstance;
    state = TestBed.inject(SeedMapperStateService);
    state.reset();
    STAT_KEYS.forEach((stat, index) => state.setStartStat(stat, 10 + index));
  });

  const baseStats = () => component.endStatsOf(component.sectionViews()[0]).map((total) => total.value);
  const allow = (...names: string[]) =>
    names.forEach((name) => state.addAvailableClass(classes.find((unitClass) => unitClass.name === name)!.id));

  it('keeps the title and help in the scrolling content rather than the sticky header', () => {
    const fixture = TestBed.createComponent(SeedMapperPageComponent);
    fixture.componentInstance.betaView.set(true);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.seeds .page-header-title h1')?.textContent).toContain('Growth Mapper');
    expect(page.querySelector('.seeds .page-header-title app-help-dialog')).not.toBeNull();
    expect(page.querySelector('.page-header .page-header-title')).toBeNull();
    expect(page.querySelector('.page-header .timeline-actions')).toBeNull();
    const actions = page.querySelector('.timeline .timeline-actions');
    expect(actions?.textContent).toContain('Add levels');
    expect(actions?.textContent).toContain('Seed RNG');
    expect(actions?.textContent).toContain('Exam / Reclass');
    expect(page.querySelector('.seeds')?.firstElementChild?.classList.contains('page-header-title')).toBeTrue();
    expect(page.querySelector('.page-header-title')?.nextElementSibling?.classList.contains('page-header')).toBeTrue();
  });

  describe('stat boosters', () => {
    const seed = () => component.sectionViews()[0];

    it('adds permanent gains at their selected level without changing growth observations or the +10 bonus pool', () => {
      state.setUnit(unitId('Cai'));
      state.setStartStat('str', 10);
      state.addLevel(seed().section.id);
      const last = seed().section.rows.at(-1)!;
      const before = component.endStatsOf(seed())[STAT_KEYS.indexOf('str')].value!;
      const marks = { ...last.marks };
      expect(state.setBoosters(seed().section.id, [{ rowId: last.id, counts: { str: 3, mov: 3 } }])).toBeNull();
      expect(component.startStatsOf(seed())[STAT_KEYS.indexOf('str')].value).toBe(10);
      expect(component.endStatsOf(seed())[STAT_KEYS.indexOf('str')].value).toBe(before + 6);
      expect(seed().section.rows.at(-1)!.marks).toEqual(marks);
      expect(component.statTotalTitle(component.endStatsOf(seed())[STAT_KEYS.indexOf('str')])).toContain('stat boosters');
      component.openProjection(seed());
      expect(component.projection()!.start.stats.str).toBe(before + 6);
      expect(component.projection()!.usedBoosters.str).toBe(3);
      expect(component.projection()!.boosterHistory.at(-1)!.counts.str).toBe(3);
    });

    it('caps boosted own stats at 120 HP / 99 others and consumes boosters even at the cap', () => {
      state.setStartStat('hp', 119);
      state.setStartStat('str', 98);
      expect(state.setBoosters(seed().section.id, [{ rowId: null, counts: { hp: 5, str: 4 } }])).toBeNull();
      expect(component.endStatsOf(seed())[0].value).toBe(120);
      expect(component.endStatsOf(seed())[STAT_KEYS.indexOf('str')].value).toBe(99);
      component.openBoosters(seed());
      expect(component.boosterEditor()!.entries[0].counts).toEqual({ hp: 5, str: 4 });
    });

    it('inherits only uses before a fork, with independent remaining allowances and descendant-safe edits', () => {
      state.setUnit(unitId('Cai'));
      state.addLevel(seed().section.id);
      const anchor = seed().section.rows[0].id;
      const later = seed().section.rows[1].id;
      expect(state.setBoosters(seed().section.id, [
        { rowId: anchor, counts: { str: 1 } }, { rowId: later, counts: { str: 3 } },
      ])).toBeNull();
      const first = state.addBranch(seed().section.id, anchor, { classId: noble.id, chance: 0, passed: true, reclass: true })!;
      const second = state.addBranch(seed().section.id, anchor, { classId: noble.id, chance: 0, passed: true, reclass: true })!;
      const byId = (id: number) => state.seedMap().sections.find((section) => section.id === id)!;
      expect(state.setBoosters(first, [{ rowId: null, counts: { str: 3 } }])).toBeNull();
      expect(state.setBoosters(second, [{ rowId: null, counts: { str: 2 } }])).toBeNull();
      expect(boosterUsage(state.seedMap().sections, byId(first)).str).toBe(4);
      expect(boosterUsage(state.seedMap().sections, byId(second)).str).toBe(3);
      const changes = state.changeCount();
      expect(state.setBoosters(first, [{ rowId: null, counts: { str: 4 } }])).toContain('Energy Drop');
      expect(state.changeCount()).toBe(changes);
      expect(state.setBoosters(seed().section.id, [{ rowId: anchor, counts: { str: 2 } }])).toContain('inherited');
      expect(boosterUsage(state.seedMap().sections, byId(first)).str).toBe(4);
      component.openBoosters(component.sectionViews().find((view) => view.section.id === first)!);
      expect(component.boosterEditor()!.inherited.str).toBe(1);
    });

    it('accounts for boosters before exam floors so permanent gains are not added twice', () => {
      state.setUnit(unitId('Cai'));
      state.setStartStat('str', 0);
      allow('Gladiator');
      const floor = gladiator.classFloorStats.str;
      expect(state.setBoosters(seed().section.id, [{ rowId: null, counts: { str: 3 } }])).toBeNull();
      state.addLevel(seed().section.id);
      const branchId = state.addBranch(seed().section.id, seed().section.rows[0].id, {
        classId: gladiator.id, chance: 100, passed: true,
      })!;
      const branch = component.sectionViews().find((view) => view.section.id === branchId)!;
      expect(component.examBoostOf(branch).str).toBe(Math.max(0, floor - 6));
    });

    it('round-trips booster levels and rejects malformed or over-limit imported counts', () => {
      state.setBoosters(seed().section.id, [
        { rowId: null, counts: { str: 1 } }, { rowId: seed().section.rows[0].id, counts: { str: 2, mov: 3 } },
      ]);
      const serializer = TestBed.inject(SeedSerializerService);
      const dto = serializer.toDto(state.snapshot());
      const wrap = () => ({ version: 2, seed: dto });
      const loaded = migrateSave(wrap());
      state.reset();
      state.restore(serializer.fromDto(loaded.seed), null);
      expect(boosterUsage(state.seedMap().sections, seed().section).str).toBe(3);
      expect(seed().section.boosters![1].rowId).toBe(seed().section.rows[0].id);
      dto.sections[0].boosters![1].counts.str = 4;
      expect(() => migrateSave(wrap())).toThrowError(/Energy Drop/);
      dto.sections[0].boosters![1].counts.str = -1;
      expect(() => migrateSave(wrap())).toThrowError(/Energy Drop/);
      dto.sections[0].boosters![1].counts.str = 2;
      dto.sections[0].boosters![1].row = 999;
      expect(() => migrateSave(wrap())).toThrowError(/missing level/);
    });

    it('removes uses attached to a removed row and refunds its allowance', () => {
      state.addLevel(seed().section.id);
      const row = seed().section.rows.at(-1)!;
      state.setBoosters(seed().section.id, [{ rowId: row.id, counts: { str: 4 } }]);
      state.removeLevel(seed().section.id, row.id);
      expect(seed().section.boosters).toEqual([]);
      expect(boosterUsage(state.seedMap().sections, seed().section).str).toBe(0);
    });
  });

  describe('draft level entry', () => {
    const seed = () => component.sectionViews()[0];

    it('does not change the map or dirty count when opened or cancelled', () => {
      const before = state.snapshot();
      const changes = state.changeCount();
      component.openLevelEntry(seed());
      expect(component.levelEntry()!.rows[0].level).toBe(3);
      component.levelEntry.set(null);
      expect(state.snapshot()).toEqual(before);
      expect(state.changeCount()).toBe(changes);
    });

    it('adds a batch atomically, matches comparator row IDs, and round-trips its marks', () => {
      state.addComparator(seed().section.id);
      const before = state.changeCount();
      component.openLevelEntry(seed());
      component.onLevelsConfirmed([{ ...toGrowth(null), str: 1 }, { ...toGrowth(null), hp: 1 }]);
      expect(seed().section.rows.length).toBe(3);
      expect(state.changeCount()).toBe(before + 1);
      expect(seed().section.rows.slice(1).map((row) => row.marks)).toEqual([
        { ...toGrowth(null), str: 1 }, { ...toGrowth(null), hp: 1 },
      ]);
      expect(seed().section.comparators[0].rows.map((row) => row.id)).toEqual(seed().section.rows.map((row) => row.id));
      expect(seed().section.comparators[0].rows.every((row) => row.marks.str === 0)).toBeTrue();
      const serializer = TestBed.inject(SeedSerializerService);
      const saved = serializer.toDto(state.snapshot());
      state.reset();
      state.restore(serializer.fromDto(saved), null);
      expect(seed().section.rows[1].marks.str).toBe(1);
      expect(seed().section.rows[2].marks.hp).toBe(1);
    });

    it('only appends to the explicitly selected branch, not the latest branch', () => {
      state.setUnit(unitId('Cai'));
      state.addLevel(seed().section.id);
      const anchor = seed().section.rows[0].id;
      const first = state.addBranch(seed().section.id, anchor, { classId: gladiator.id, chance: 100, passed: true })!;
      const latest = state.addBranch(seed().section.id, anchor, { classId: noble.id, chance: 0, passed: false })!;
      component.timelineFocusId.set(first);
      component.openLevelEntry(component.focusedTimeline());
      component.onLevelsConfirmed([{ ...toGrowth(null), str: 1 }]);
      const byId = (id: number) => state.seedMap().sections.find((section) => section.id === id)!;
      expect(byId(first).rows.length).toBe(2);
      expect(byId(latest).rows.length).toBe(1);
      expect(seed().section.rows.length).toBe(2);
    });

    it('previews shared observations and updates identical roll/growth rows on confirmation', () => {
      state.setUnit(unitId('Cai'));
      const anchor = seed().section.rows[0].id;
      state.addLevel(seed().section.id);
      state.addLevel(seed().section.id);
      state.toggleStat(seed().section.id, seed().section.rows[2].id, 'str');
      const branchId = state.addBranch(seed().section.id, anchor, { classId: noble.id, chance: 0, passed: true, reclass: true })!;
      const branch = () => component.sectionViews().find((view) => view.section.id === branchId)!;
      component.openLevelEntry(branch());
      expect(component.levelEntry()!.rows[0].sharedWith).toBe('Seed Lv 4');
      expect(component.levelEntry()!.rows[0].marks.str).toBe(1);
      component.onLevelsConfirmed([{ ...toGrowth(null), hp: 1 }]);
      expect(seed().section.rows[2].marks).toEqual({ ...toGrowth(null), hp: 1 });
      expect(branch().section.rows[1].marks).toEqual(seed().section.rows[2].marks);
    });

    it('bounds batches at Lv 99, disables reopening there, and rejects oversized batches', () => {
      state.setStatsLevel(96);
      component.openLevelEntry(seed());
      expect(component.levelEntry()!.rows.map((row) => row.level)).toEqual([98, 99]);
      component.onLevelsConfirmed([toGrowth(null), toGrowth(null), toGrowth(null)]);
      expect(component.levelEntryError()).toContain('valid number');
      expect(seed().section.rows.length).toBe(1);
      component.onLevelsConfirmed([toGrowth(null), toGrowth(null)]);
      expect(component.endLevelOf(seed())).toBe(99);
      expect(component.canAddLevel(seed())).toBeFalse();
      component.openLevelEntry(seed());
      expect(component.levelEntry()).toBeNull();
    });

    it('reports a stale draft without appending to a changed timeline', () => {
      component.openLevelEntry(seed());
      state.addLevel(seed().section.id);
      component.onLevelsConfirmed([toGrowth(null)]);
      expect(component.levelEntryError()).toContain('timeline changed');
      expect(seed().section.rows.length).toBe(2);
    });

    it('carries forward the last inline class and mount and previews class growth gates correctly', () => {
      state.setUnit(unitId('Cai'));
      state.setStatsLevel(33);
      allow('Charioteer');
      state.setReclass(seed().section.id, seed().section.rows[0].id, classes.find((unitClass) => unitClass.name === 'Charioteer')!.id);
      component.openLevelEntry(seed());
      const preview = component.levelEntry()!.rows.slice(0, 2);
      expect(preview.map((row) => row.level)).toEqual([35, 36]);
      expect(preview.map((row) => row.className)).toEqual(['Charioteer', 'Charioteer']);
      component.onLevelsConfirmed([toGrowth(null), toGrowth(null)]);
      expect(preview.map((row) => row.growth)).toEqual([component.rowGrowth(seed(), 1), component.rowGrowth(seed(), 2)]);
    });
  });

  it('adds battalions to the shared +10 bonus cap and names the source', () => {
    const section = () => component.sectionViews()[0];
    const battalion = component.battalions().find((candidate) => candidate.spd > 0)!;
    const spd = STAT_KEYS.indexOf('spd');
    component.onBattalionChange(section(), String(battalion.id));
    let total = component.endStatsOf(section())[spd];
    expect(total.value).toBe(13 + battalion.spd);
    expect(component.statTotalTitle(total)).toContain(battalion.name);
    allow('The Blade');
    state.setAbilities(section().section.id, ['Divine Insight']);
    total = component.endStatsOf(section())[spd];
    expect(total.value).toBe(23);
    expect(total.capped).toBe(battalion.spd);
    expect(component.statHasBonus(total)).toBeTrue();
    component.onBattalionChange(section(), '');
    expect(component.battalionOf(section())).toBeNull();
  });

  it('inherits and saves battalions, warns about missing names, and accepts older saves', () => {
    state.setUnit(unitId('Cai'));
    const section = state.seedMap().sections[0];
    const battalion = component.battalions()[0];
    state.setBattalion(section.id, battalion.id);
    state.addLevel(section.id);
    state.addBranch(section.id, section.rows[0].id, { classId: gladiator.id, chance: 100, passed: true });
    const serializer = TestBed.inject(SeedSerializerService);
    const dto = serializer.toDto(state.snapshot());
    expect(dto.sections.map((entry) => entry.battalion)).toEqual([battalion.name, battalion.name]);
    state.restore(serializer.fromDto(migrateSave({ version: 2, seed: dto }).seed), null);
    expect(state.seedMap().sections.map((entry) => entry.battalionId)).toEqual([battalion.id, battalion.id]);
    component.openProjection(component.sectionViews().at(-1)!);
    expect(component.projection()!.battalion?.id).toBe(battalion.id);
    dto.sections[0].battalion = 'Missing battalion';
    expect(serializer.missingNames(dto)).toContain('Missing battalion');
    dto.sections.forEach((entry) => delete entry.battalion);
    state.restore(serializer.fromDto(migrateSave({ version: 2, seed: dto }).seed), null);
    expect(component.sectionViews().every((view) => component.battalionOf(view) === null)).toBeTrue();
  });

  it('caps base and level gains before adding class and non-class bonuses', () => {
    state.setUnit(unitId('Lysander'));
    allow('Gladiator');
    const section = () => component.sectionViews()[0];
    state.setClass(section().section.id, gladiator.id);
    for (const stat of STAT_KEYS) {
      state.setStartStat(stat, MAX_BASE_STATS[stat] - 1 + noble.bonusStats[stat]);
    }
    const battalion = component.battalions().find((candidate) => candidate.str > 0)!;
    state.setBattalion(section().section.id, battalion.id);
    allow('The Blade');
    state.setAbilities(section().section.id, ['Divine Insight']);
    state.addLevel(section().section.id);
    for (const row of section().section.rows) {
      for (const stat of STAT_KEYS) {
        state.toggleStat(section().section.id, row.id, stat);
      }
    }
    const totals = component.endStatsOf(section());
    for (const [index, stat] of STAT_KEYS.entries()) {
      expect(totals[index].value).toBe(MAX_BASE_STATS[stat] + gladiator.bonusStats[stat] + Math.min(10, battalion[stat] + (stat === 'spd' ? 10 : 0)));
      expect(totals[index].gained).toBe(1);
    }
    component.openProjection(section());
    expect(component.projection()!.start.stats).toEqual(MAX_BASE_STATS);
    expect(component.projection()!.actuals.at(-1)!.stats).toEqual(MAX_BASE_STATS);
  });

  describe('equipment', () => {
    const sword = ITEMS.find((item) => item.Name === 'Wooden Sword')!;
    const original = sword.BonusStats;
    beforeEach(() => { sword.BonusStats = [{ Spd: 4, Str: 2 }]; });
    afterEach(() => { sword.BonusStats = original; });

    it('shares the stat cap with abilities and names equipment in the bonus tooltip', () => {
      const id = state.seedMap().sections[0].id;
      const spd = STAT_KEYS.indexOf('spd');
      const str = STAT_KEYS.indexOf('str');
      state.setEquipment(id, [sword.Name]);
      let totals = component.endStatsOf(component.sectionViews()[0]);
      expect(totals[spd].value).toBe(10 + spd + 4);
      expect(totals[str].value).toBe(10 + str + 2);
      expect(component.statTotalTitle(totals[spd])).toContain('Wooden Sword');
      allow('The Blade');
      state.setAbilities(id, ['Divine Insight']);
      totals = component.endStatsOf(component.sectionViews()[0]);
      expect(totals[spd].value).toBe(10 + spd + 10);
      expect(totals[spd].capped).toBe(4);
      expect(component.statTotalTitle(totals[spd])).toContain('Class +0; Modifier +10');
      expect(component.statHasBonus(totals[spd])).toBeTrue();
      state.setEquipment(id, []);
      expect(component.endStatsOf(component.sectionViews()[0])[str].value).toBe(10 + str);
    });

    it('retains equipment through exams, serialization, migration and restoration', () => {
      const id = state.seedMap().sections[0].id;
      component.equipmentSectionId.set(id);
      component.onEquipmentConfirmed([sword.Name]);
      expect(component.equipmentSectionId()).toBeNull();
      state.addLevel(id);
      state.addExam(id, state.seedMap().sections[0].rows[0].id, {
        classId: gladiator.id, chance: 100, passed: true,
      });
      const serializer = TestBed.inject(SeedSerializerService);
      const seed = serializer.toDto(state.snapshot());
      const loaded = migrateSave({ version: 2, seed });
      state.reset();
      state.restore(serializer.fromDto(loaded.seed), null);
      expect(state.seedMap().sections.map((section) => section.equipment)).toEqual([[sword.Name], [sword.Name]]);
      expect(state.seedMap().sections.map((section) => section.weapon)).toEqual(['sword', 'sword']);
      expect(serializer.missingNames(seed)).toEqual([]);
      seed.sections[0].equipment = ['Missing item'];
      expect(serializer.missingNames(seed)).toContain('Missing item');
    });

    it('loads older saves without equipment', () => {
      const serializer = TestBed.inject(SeedSerializerService);
      const seed = serializer.toDto(state.snapshot());
      seed.sections.forEach((section) => delete section.equipment);
      const loaded = migrateSave({ version: 2, seed });
      state.restore(serializer.fromDto(loaded.seed), null);
      expect(state.seedMap().sections[0].equipment).toEqual([]);
    });

    it('preserves the exact upgrade name through serialization and restoration', () => {
      state.setEquipment(state.seedMap().sections[0].id, ['Wooden Sword+1']);
      const serializer = TestBed.inject(SeedSerializerService);
      const seed = serializer.toDto(state.snapshot());
      expect(serializer.missingNames(seed)).toEqual([]);
      state.reset();
      state.restore(serializer.fromDto(seed), null);
      expect(state.seedMap().sections[0].equipment).toEqual(['Wooden Sword+1']);
      expect(state.seedMap().sections[0].weapon).toBe('sword');
    });

    it('passes equipment to projections and hides the legacy ability weapon picker', () => {
      component.onUnitChange(unitId('Cai'));
      const id = state.seedMap().sections[0].id;
      state.setEquipment(id, [sword.Name]);
      component.openAbilityPicker(component.sectionViews()[0]);
      expect(component.pickerConfig()!.weaponNeeded).toBeFalse();
      state.addLevel(id);
      component.openProjection(component.sectionViews()[0]);
      expect(component.projection()!.equipment).toEqual([sword.Name]);
    });
  });

  it('shows the entered stats as-is while the base section is Noble/Commoner', () => {
    state.setClass(state.seedMap().sections[0].id, noble.id);

    expect(baseStats()).toEqual(STAT_KEYS.map((_, index) => 10 + index));
  });

  it("fills the starting stats with the character's Lv 1 base stats, but not from another starting level", () => {
    component.onUnitChange(unitId('Cai'));
    expect(state.seedMap().startStats).toEqual({ hp: 27, str: 10, mag: 7, spd: 8, dex: 8, def: 6, res: 5, lck: 6, cha: 5 });

    component.onUnitChange(unitId('Eshmel (F)'));
    expect(state.seedMap().startStats.str).toBe(12);

    state.setStatsLevel(10);
    state.setStartStat('str', 20);
    component.onUnitChange(unitId('Peter'));
    expect(state.seedMap().startStats.str).toBe(20);
  });

  it('adds the class bonus stats when the base section switches from Noble/Commoner to Gladiator', () => {
    state.addAvailableClass(gladiator.id);
    state.setClass(state.seedMap().sections[0].id, gladiator.id);

    expect(component.sectionViews()[0].classId).toBe(gladiator.id);
    expect(baseStats()).toEqual(
      STAT_KEYS.map((stat, index) => 10 + index + gladiator.bonusStats[stat] - noble.bonusStats[stat]),
    );
    expect(gladiator.bonusStats.str).toBeGreaterThan(0);
  });

  it('adds equipped stat abilities to the shown stats and removes them when unequipped', () => {
    const section = () => state.seedMap().sections[0];
    const spd = STAT_KEYS.indexOf('spd');
    const str = STAT_KEYS.indexOf('str');
    const mag = STAT_KEYS.indexOf('mag');

    allow('The Blade', 'Ornius Rider');
    state.setAbilities(section().id, ['Divine Insight', 'Offense Basics']);
    const totals = component.endStatsOf(component.sectionViews()[0]);

    expect(totals[spd].value).toBe(10 + spd + 10);
    expect(totals[str].value).toBe(10 + str + 1);
    expect(totals[mag].value).toBe(10 + mag + 1);
    expect(totals[spd].abilitySources).toEqual(['Divine Insight']);
    expect(component.statTotalTitle(totals[spd])).toContain('+10 from Divine Insight');

    component.openAbilityPicker(component.sectionViews()[0]);
    component.onPickerConfirmed(['Offense Basics']);

    expect(component.pickerDialog()).toBeNull();
    expect(baseStats()[spd]).toBe(10 + spd);
    expect(baseStats()[str]).toBe(10 + str + 1);
  });

  it('projects from the starting stats, with every mapped level as an actual to compare', () => {
    component.onUnitChange(unitId('Cai'));
    const seedId = state.seedMap().sections[0].id;
    state.setClass(seedId, noble.id);
    state.addLevel(seedId);
    state.addLevel(seedId);
    component.openProjection(component.sectionViews()[0]);
    const projected = component.projection()!;
    const start = state.seedMap().statsLevel;
    const rows = state.seedMap().sections[0].rows.length;
    const levels = Array.from({ length: rows }, (_, index) => start + index);

    expect(projected.history.start.level).toBe(start);
    expect(projected.history.steps.map((step) => step.fromLevel)).toEqual(levels);
    expect(projected.actuals.map((actual) => actual.level)).toEqual(levels.map((level) => level + 1));
    expect(projected.history.start.stats).toEqual(jasmine.objectContaining({ str: state.seedMap().startStats.str! }));
    expect(projected.start.level).toBe(start + rows);
  });

  it('carries equipped abilities into a new exam and keeps them through save and load', () => {
    const seedId = state.seedMap().sections[0].id;
    state.setAbilities(seedId, ['Divine Might']);
    state.addLevel(seedId);
    const examId = state.addExam(seedId, state.seedMap().sections[0].rows[0].id, {
      classId: gladiator.id,
      chance: 100,
      passed: true,
    })!;

    expect(state.seedMap().sections.find((section) => section.id === examId)!.abilities).toEqual(['Divine Might']);

    const snapshot = state.snapshot();
    state.reset();
    state.restore(snapshot, null);

    expect(state.seedMap().sections.map((section) => section.abilities)).toEqual([['Divine Might'], ['Divine Might']]);
  });

  it('opens the ability dialog with the equipped abilities ticked and a limit of five', () => {
    allow('The Trident');
    state.setAbilities(state.seedMap().sections[0].id, ['Divine Wall']);
    component.openAbilityPicker(component.sectionViews()[0]);
    const config = component.pickerConfig()!;

    expect(config.selected).toEqual(['Divine Wall']);
    expect(config.max).toBe(5);
    expect(config.groups.map((group) => group.label)).toEqual(['Class abilities']);
    expect(config.groups[0].items.map((item) => item.name)).not.toContain('Divine Law');
  });

  it('adds and removes available classes when the class dialog is confirmed, keeping Noble/Commoner', () => {
    const hunter = classes.find((unitClass) => unitClass.name === 'Hunter')!;
    state.addAvailableClass(gladiator.id);
    component.openClassPicker();
    const items = component.pickerConfig()!.groups.flatMap((group) => group.items);

    expect(items.find((item) => item.name === noble.name)!.fixed).toBeTrue();
    expect(component.pickerConfig()!.selected).toEqual([String(gladiator.id)]);

    component.onPickerConfirmed([String(noble.id), String(hunter.id)]);

    expect(state.seedMap().availableClassIds).toEqual([hunter.id]);
    expect(component.availableClassNames(component.sectionViews()[0])).toEqual(
      jasmine.arrayContaining([noble.name, hunter.name]),
    );
  });

  it('leaves everything unchanged when the dialog is closed without confirming', () => {
    component.openClassPicker();
    component.closePicker();

    expect(component.pickerConfig()).toBeNull();
    expect(state.seedMap().availableClassIds).toEqual([]);
  });

  describe("Mu's Warrior's Blood", () => {
    const view = () => component.sectionViews()[0];
    const sectionId = () => state.seedMap().sections[0].id;
    const options = () => {
      component.openAbilityPicker(view());
      return component.pickerConfig()!.groups.flatMap((group) => group.items.map((item) => item.name));
    };
    const stat = (key: (typeof STAT_KEYS)[number]) => baseStats()[STAT_KEYS.indexOf(key)]!;
    const base = (key: (typeof STAT_KEYS)[number]) => 10 + STAT_KEYS.indexOf(key);
    const reach = (level: number) => state.setStatsLevel(level - 1);

    it('offers Mu class abilities and one Warrior’s Blood entry at the appropriate levels', () => {
      expect(options()).not.toContain("Warrior's Blood");

      state.setUnit(unitId('Mu'));
      allow('Gladiator');
      reach(19);
      expect(options()).toContain('Attack Basics');
      expect(options()).not.toContain("Warrior's Blood");
      expect(options()).not.toContain("Warrior's Blood+");
      const item = (name: string) => component.pickerConfig()!.groups.flatMap((group) => group.items).find((candidate) => candidate.name === name)!;

      reach(20);
      expect(options()).toContain("Warrior's Blood");
      expect(item("Warrior's Blood").locked).toBeUndefined();
      expect(options()).not.toContain("Warrior's Blood+");

      state.setAbilities(sectionId(), ["Warrior's Blood"]);
      reach(35);
      expect(options()).not.toContain("Warrior's Blood");
      expect(item("Warrior's Blood+").locked).toBeUndefined();
      expect(item("Warrior's Blood+").id).toBe("Warrior's Blood");
      expect(component.pickerConfig()!.selected).toEqual(["Warrior's Blood"]);
      component.onPickerConfirmed(component.pickerConfig()!.selected);
      expect(component.equippedAbilities(view()).map((ability) => ability.name)).toEqual(["Warrior's Blood+"]);
      reach(34);
      expect(component.equippedAbilities(view()).map((ability) => ability.name)).toEqual(["Warrior's Blood"]);
    });

    it('lists Mu, not Mu*, among the units', () => {
      const names = component.units().map((unit) => unit.name);

      expect(names).toContain('Mu');
      expect(names).not.toContain('Mu*');
    });

    it('uses the Inventory weapon only once learned and upgrades the bonus at Lv 35', () => {
      state.setUnit(unitId('Mu'));
      state.setAbilities(sectionId(), ["Warrior's Blood"]);
      component.equipmentSectionId.set(sectionId());
      component.onEquipmentConfirmed(['Wooden Sword']);
      reach(19);
      expect(stat('spd')).toBe(base('spd'));

      reach(20);
      expect(stat('spd')).toBe(base('spd') + 2);
      expect(stat('dex')).toBe(base('dex'));

      reach(35);
      expect(component.equippedAbilities(view()).map((ability) => ability.name)).toEqual(["Warrior's Blood+"]);
      expect(stat('spd')).toBe(base('spd') + 2);
      expect(stat('dex')).toBe(base('dex') + 2);

      state.setEquipment(sectionId(), ['Wooden Gauntlets']);
      expect(stat('str')).toBe(base('str') + 2);
      expect(stat('spd')).toBe(base('spd') + 2);
      expect(stat('dex')).toBe(base('dex'));

      state.setEquipment(sectionId(), []);
      expect(stat('str')).toBe(base('str'));
      expect(stat('spd')).toBe(base('spd'));
      expect(stat('dex')).toBe(base('dex'));
    });

    it("does not activate Warrior's Blood without the ability equipped", () => {
      state.setUnit(unitId('Mu'));
      reach(35);
      state.setEquipment(sectionId(), ['Answerer Huang']);
      expect(stat('spd')).toBe(base('spd'));
      expect(stat('dex')).toBe(base('dex'));
    });

    it('ignores a saved weapon type without Inventory and retains the association after loading', () => {
      state.setUnit(unitId('Mu'));
      reach(35);
      state.setAbilities(sectionId(), ["Warrior's Blood"]);
      state.setEquipment(sectionId(), ['Answerer Huang']);
      const serializer = TestBed.inject(SeedSerializerService);
      const seed = serializer.toDto(state.snapshot());
      state.reset();
      state.restore(serializer.fromDto(seed), null);
      expect(stat('spd')).toBe(base('spd') + 2);
      expect(stat('dex')).toBe(base('dex') + 2);

      delete seed.sections[0].equipment;
      state.restore(serializer.fromDto(seed), null);
      expect(stat('spd')).toBe(base('spd'));
      expect(stat('dex')).toBe(base('dex'));
    });
  });

  it('adds Blaze and personal bonuses, but no more than +10 to a stat from everything but the class', () => {
    const def = STAT_KEYS.indexOf('def');
    state.setUnit(unitId('Orchel'));
    expect(baseStats()[def]).toBe(10 + def + 5 + 5);

    allow('The Trident');
    state.setAbilities(state.seedMap().sections[0].id, ['Divine Wall']);
    expect(baseStats()[def]).toBe(10 + def + 10);
    expect(component.statTotalTitle(component.endStatsOf(component.sectionViews()[0])[def])).toContain('limit');
  });

  it('allows at most five equipped abilities', () => {
    const sectionId = state.seedMap().sections[0].id;
    state.setAbilities(sectionId, ['Divine Might', 'Divine Wall', 'Divine Law', 'Piety', 'Bolster Health', 'Divine Will']);

    expect(state.seedMap().sections[0].abilities).toEqual(['Divine Might', 'Divine Wall', 'Divine Law', 'Piety', 'Bolster Health']);
  });

  describe('class-taught abilities', () => {
    const view = () => component.sectionViews()[0];
    const item = (name: string) => {
      component.openAbilityPicker(view());
      return component.pickerConfig()!.groups.flatMap((group) => group.items).find((candidate) => candidate.name === name)!;
    };
    const str = () => baseStats()[STAT_KEYS.indexOf('str')];

    it('enables abilities only when a qualifying class is available', () => {
      state.setUnit(unitId('Cai'));
      expect(component.hasAvailableAbilities(view())).toBeFalse();
      allow('Gladiator');
      expect(component.hasAvailableAbilities(view())).toBeTrue();
    });

    it('offers mastery abilities only when their class is available', () => {
      expect(item('Attack Basics')).toBeUndefined();
      expect(item('Hunting Basics')).toBeUndefined();

      allow('Gladiator');

      expect(item('Attack Basics').locked).toBeUndefined();
      expect(item('Hunting Basics')).toBeUndefined();
    });

    it('stops counting an equipped ability once its class leaves the pool', () => {
      allow('Gladiator');
      state.setAbilities(view().section.id, ['Attack Basics']);
      expect(str()).toBe(10 + STAT_KEYS.indexOf('str') + 1);

      component.openClassPicker();
      component.onPickerConfirmed([String(noble.id)]);

      expect(component.equippedAbilities(view())).toEqual([]);
      expect(str()).toBe(10 + STAT_KEYS.indexOf('str'));
    });

    it("unlocks an exam's class abilities from the class it passed into", () => {
      const seedId = state.seedMap().sections[0].id;
      const examId = state.addExam(seedId, state.seedMap().sections[0].rows[0].id, {
        classId: gladiator.id,
        chance: 100,
        passed: true,
      })!;
      const exam = () => component.sectionViews().find((candidate) => candidate.section.id === examId)!;

      component.openAbilityPicker(exam());
      const attack = component.pickerConfig()!.groups.flatMap((group) => group.items).find((candidate) => candidate.name === 'Attack Basics')!;

      expect(attack.locked).toBeUndefined();
      expect(item('Attack Basics')).toBeUndefined();
    });

    it('never locks character abilities by class, which no class teaches', () => {
      state.setUnit(unitId('Mu'));
      state.setStatsLevel(40);

      expect(item("Warrior's Blood+").locked).toBeUndefined();
    });
  });

  describe('reclass', () => {
    const seed = () => component.sectionViews()[0];
    const rows = () => state.seedMap().sections[0].rows;
    const seedId = () => state.seedMap().sections[0].id;
    const str = STAT_KEYS.indexOf('str');
    const hunter = () => classes.find((unitClass) => unitClass.name === 'Hunter')!;
    const reclassDraft = (classId: number) => ({ classId, chance: 100, passed: true, reclass: true });

    beforeEach(() => {
      state.setUnit(unitId('Hong Hua'));
      allow('Gladiator', 'Hunter');
      state.setClass(seedId(), gladiator.id);
      state.addLevel(seedId());
      state.toggleStat(seedId(), rows()[0].id, 'str');
    });

    it('switches class from the + level on, inside the same section, without skipping a level', () => {
      const levels = rows().map((_, index) => component.levelOf(seed(), index));

      component.openExamAt(seed(), 1);
      component.onExamConfirmed(reclassDraft(noble.id));

      expect(state.seedMap().sections.length).toBe(1);
      expect(rows()[1].reclassTo).toBe(noble.id);
      expect(rows().map((_, index) => component.levelOf(seed(), index))).toEqual(levels);
      expect(component.rowClassId(seed(), 0)).toBe(gladiator.id);
      expect(component.rowClassId(seed(), 1)).toBe(noble.id);
    });

    it('uses the new class growth rates for the reclassed levels', () => {
      state.setReclass(seedId(), rows()[1].id, hunter().id);

      expect(component.rowGrowth(seed(), 0)).toEqual(seed().growth);
      expect(component.rowGrowth(seed(), 1)!.spd).toBe(seed().growth.spd - gladiator.spd + hunter().spd);
    });

    it('ends with the stats and class bonus of the class the section finishes in', () => {
      state.setReclass(seedId(), rows()[1].id, noble.id);
      const end = component.endStatsOf(seed());

      expect(end[str].value).toBe(10 + str + 1);
      expect(end[str].classBonus).toBe(0);
    });

    it('offers the other available classes, leaving out the one being left', () => {
      component.openExamAt(seed(), 1);
      const names = component.examDialog()!.reclassGroups.flatMap((group) => group.items.map((item) => item.name));

      expect(names).toEqual(jasmine.arrayWithExactContents([noble.name, 'Hunter']));
    });

    it('adds a new level that starts with the reclass from Exam / Reclass', () => {
      component.openAppendExam(seed());
      component.onExamConfirmed(reclassDraft(hunter().id));

      expect(rows().length).toBe(3);
      expect(rows()[2].reclassTo).toBe(hunter().id);
      expect(state.seedMap().sections.length).toBe(1);
    });

    it('lets a reclass be changed or removed in place', () => {
      state.setReclass(seedId(), rows()[1].id, noble.id);

      component.onReclassChange(seed(), rows()[1], hunter().id);
      expect(component.rowClassId(seed(), 1)).toBe(hunter().id);

      component.removeReclass(seed(), rows()[1]);
      expect(rows()[1].reclassTo).toBeUndefined();
      expect(component.rowClassId(seed(), 1)).toBe(gladiator.id);
    });

    it('keeps the reclassed class for a failed exam taken after it', () => {
      state.setReclass(seedId(), rows()[1].id, noble.id);
      const examId = state.addExam(seedId(), rows()[1].id, { classId: hunter().id, chance: 10, passed: false })!;

      expect(component.sectionViews().find((view) => view.section.id === examId)!.classId).toBe(noble.id);
    });

    it('drops a reclass whose class leaves the available classes', () => {
      state.setReclass(seedId(), rows()[1].id, hunter().id);
      state.removeAvailableClass(hunter().id);

      expect(rows()[1].reclassTo).toBeUndefined();
    });

    it('keeps reclasses through save and load, and reads older saves without them', () => {
      state.setReclass(seedId(), rows()[1].id, noble.id);
      const serializer = TestBed.inject(SeedSerializerService);
      const saved = JSON.parse(
        JSON.stringify({ version: 2, id: 'x', name: 'x', savedAt: '', seed: serializer.toDto(state.snapshot()) }),
      );

      state.reset();
      state.restore(serializer.fromDto(migrateSave(saved).seed), null);
      expect(rows().map((row) => row.reclassTo)).toEqual([undefined, noble.id]);

      delete saved.seed.sections[0].reclasses;
      expect(migrateSave(saved).seed.sections[0].reclasses).toEqual([]);
    });
  });

  describe('inline exams', () => {
    const seed = () => component.sectionViews()[0];
    const rows = () => state.seedMap().sections[0].rows;
    const seedId = () => state.seedMap().sections[0].id;
    const str = STAT_KEYS.indexOf('str');
    const eternal = classes.find((unitClass) => unitClass.name === 'The Eternal')!;
    const hunter = () => classes.find((unitClass) => unitClass.name === 'Hunter')!;
    const examDraft = (classId: number, passed = true, chance = 40) => ({ classId, chance, passed, reclass: false });

    it('adds a level that starts with the exam from Exam / Reclass, in the same section', () => {
      state.setUnit(unitId('Hong Hua'));
      component.openAppendExam(seed());
      component.onExamConfirmed(examDraft(hunter().id));

      expect(state.seedMap().sections.length).toBe(1);
      expect(rows().length).toBe(2);
      expect(rows()[1].exam).toEqual({ classId: hunter().id, chance: 40, passed: true });
      expect(component.rowClassId(seed(), 0)).toBe(noble.id);
      expect(component.rowClassId(seed(), 1)).toBe(hunter().id);
      expect(component.levelOf(seed(), 1)).toBe(component.levelOf(seed(), 0) + 1);
    });

    it('still branches into its own section from the + button', () => {
      state.setUnit(unitId('Hong Hua'));
      state.addLevel(seedId());
      component.openExamAt(seed(), 1);
      component.onExamConfirmed(examDraft(hunter().id));

      expect(state.seedMap().sections.length).toBe(2);
      expect(rows().some((row) => row.exam)).toBeFalse();
    });

    it('uses a roll of its own, so the level after it moves to the next roll', () => {
      state.addExamLevel(seedId(), { classId: hunter().id, chance: 40, passed: true });
      const rng = component.rngSections()[0].rows;

      expect(component.slotOf(seed(), 1)).toBe(component.slotOf(seed(), 0) + 2);
      expect(rng.map((row) => row.label)).toEqual(['Lv 2', 'Exam', 'Lv 3']);
      expect(rng[1].passChance).toBe(40);
    });

    it("raises stats below the exam class's base stats, from that level on", () => {
      state.addExamLevel(seedId(), { classId: eternal.id, chance: 40, passed: true });
      const boost = eternal.classFloorStats.str - (10 + str);
      const end = component.endStatsOf(seed());

      expect(component.inlineBoostOf(seed(), 1).str).toBe(boost);
      expect(end[str].floorBoost).toBe(boost);
      expect(end[str].value).toBe(eternal.classFloorStats.str + eternal.bonusStats.str - noble.bonusStats.str);
    });

    it('keeps the class and adds no boost when failed, but still counts as a Str roll', () => {
      state.addExamLevel(seedId(), { classId: eternal.id, chance: 40, passed: false });

      expect(component.rowClassId(seed(), 1)).toBe(noble.id);
      expect(component.inlineBoostOf(seed(), 1).str).toBe(0);
      expect(component.rollsAt(component.slotOf(seed(), 1) - 1)[str]).not.toEqual(component.rollsAt(999)[str]);
    });

    it('adds a passed exam class to the classes available for reclasses and abilities', () => {
      state.addExamLevel(seedId(), { classId: hunter().id, chance: 40, passed: true });

      expect(component.availableClassNames(seed())).toContain('Hunter');
    });

    it('can be changed and removed in the grid, keeping the level', () => {
      state.addExamLevel(seedId(), { classId: hunter().id, chance: 40, passed: true });

      component.onInlineExamPassed(seed(), rows()[1], false);
      expect(component.rowClassId(seed(), 1)).toBe(noble.id);

      component.removeInlineExam(seed(), rows()[1]);
      expect(rows().length).toBe(2);
      expect(rows()[1].exam).toBeUndefined();
    });

    it('keeps inline exams through save and load', () => {
      state.addExamLevel(seedId(), { classId: hunter().id, chance: 40, passed: true });
      const serializer = TestBed.inject(SeedSerializerService);
      const saved = JSON.parse(
        JSON.stringify({ version: 2, id: 'x', name: 'x', savedAt: '', seed: serializer.toDto(state.snapshot()) }),
      );

      state.reset();
      state.restore(serializer.fromDto(migrateSave(saved).seed), null);

      expect(rows()[1].exam).toEqual({ classId: hunter().id, chance: 40, passed: true });
    });

    it('folds an old exam section that carried on from the last level into the seed', () => {
      state.addLevel(seedId());
      const lastRowId = rows()[1].id;
      state.addExam(seedId(), lastRowId, { classId: hunter().id, chance: 40, passed: true });
      state.addExam(seedId(), rows()[0].id, { classId: eternal.id, chance: 30, passed: false });

      state.restore(state.snapshot(), null);

      const sections = state.seedMap().sections;
      expect(sections.length).toBe(2);
      expect(sections[0].rows.length).toBe(3);
      expect(sections[0].rows[2].exam).toEqual({ classId: hunter().id, chance: 40, passed: true });
      expect(sections[1].exam!.afterRowId).toBe(sections[0].rows[0].id);
    });
  });
});
