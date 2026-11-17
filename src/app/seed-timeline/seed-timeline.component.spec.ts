import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { CLASS_LEVEL_CONFIGS, mountGrowthAt, scaleGrowth, STAT_KEYS, StatKey, sumGrowth, toGrowth, Unit, UnitClass, ZERO_GROWTH } from '../models/growth.models';
import { SeedMapperStateService } from '../services/seed-mapper-state.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SeedMapperPageComponent } from '../seed-mapper-page/seed-mapper-page.component';
import { SeedTimelineComponent } from './seed-timeline.component';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { migrateSave } from '../models/seed-save';
import { skillIconUrl } from '../icon-links';
import { MAX_LEVEL } from '../services/seed-mapper-state.service';

const classes = unitClassData as UnitClass[];
const classId = (name: string) => classes.find((unitClass) => unitClass.name === name)!.id;
const unitId = (name: string) => (unitData as Pick<Unit, 'id' | 'name'>[]).find((unit) => unit.name === name)!.id;

describe('Seed timeline branches', () => {
  let page: SeedMapperPageComponent;
  let state: SeedMapperStateService;

  const seed = () => state.seedMap().sections[0];
  const view = (sectionId: number) => page.sectionViews().find((candidate) => candidate.section.id === sectionId)!;
  const seedView = () => page.sectionViews()[0];
  const lv12 = () => seed().rows[10].id;
  const exam = (name: string, passed = true) =>
    state.addBranch(seed().id, lv12(), { classId: classId(name), chance: 40, passed })!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [SeedMapperPageComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SeedMapperPageComponent);
    page = fixture.componentInstance;
    state = TestBed.inject(SeedMapperStateService);
    state.reset();
    state.setUnit(unitId('Cai'));

    for (let index = 0; index < 12; index++) {
      state.addLevel(seed().id);
    }
  });

  it('lets several exams branch off at the same level, all using one roll and sharing the level ups after it', () => {
    const diviner = view(exam('Diviner'));
    const gladiator = view(exam('Gladiator'));
    const failed = view(exam('Diviner', false));

    for (const branch of [diviner, gladiator, failed]) {
      expect(branch.exam!.slot).toBe(page.slotOf(seedView(), 11));
      expect(page.slotOf(branch, 0)).toBe(page.slotOf(seedView(), 12));
      expect(page.levelOf(branch, 0)).toBe(13);
    }
  });

  it('makes a reclass a branch that uses no roll, so its first level up shares the roll of the level it replaces', () => {
    const reclass = view(
      state.addBranch(seed().id, lv12(), { classId: classId('Gladiator'), chance: 0, passed: true, reclass: true })!,
    );

    expect(reclass.title).toBe('Reclass 1');
    expect(reclass.exam).toBeNull();
    expect(reclass.classId).toBe(classId('Gladiator'));
    expect(page.levelOf(reclass, 0)).toBe(13);
    expect(page.slotOf(reclass, 0)).toBe(page.slotOf(seedView(), 11));
  });

  it('has a level up with the same roll and growth rates follow the one that holds the marks', () => {
    const failed = view(exam('Diviner', false));
    const owner = page.rowOwner(failed, 0);

    expect(owner.view.section.id).toBe(seed().id);
    expect(owner.rowIndex).toBe(12);

    page.setSharedMark(failed, 0, 'str', true);

    expect(seed().rows[12].marks.str).toBe(1);
    expect(view(failed.section.id).section.rows[0].marks.str).toBe(1);
    expect(page.rowOwner(view(exam('Gladiator')), 0).view.section.id).not.toBe(seed().id);
  });

  it('keeps reclass branches and same-level exams as branches through save and load', () => {
    const last = seed().rows.at(-1)!.id;
    state.addBranch(seed().id, last, { classId: classId('Diviner'), chance: 40, passed: true });
    state.addBranch(seed().id, last, { classId: classId('Gladiator'), chance: 60, passed: false });
    state.addBranch(seed().id, lv12(), { classId: classId('Gladiator'), chance: 0, passed: true, reclass: true });

    const serializer = TestBed.inject(SeedSerializerService);
    const loaded = serializer.fromDto(serializer.toDto(state.snapshot()));
    state.reset();
    state.restore(loaded, null);

    const branches = state.seedMap().sections.slice(1);
    expect(branches.length).toBe(3);
    expect(branches.map((section) => section.exam!.reclass === true)).toEqual([false, false, true]);
    expect(page.sectionViews().map((candidate) => candidate.title)).toEqual(['Seed', 'Exam 1', 'Exam 2', 'Reclass 1']);
  });

  it('can pass an exam but stay in the current class, unlocking the exam class without its base stats', () => {
    state.addAvailableClass(classId('Gladiator'));
    state.setClass(seed().id, classId('Gladiator'));
    const stayed = view(
      state.addBranch(seed().id, lv12(), { classId: classId('Ornius Rider'), chance: 40, passed: true, keepClass: true })!,
    );
    const switched = view(exam('Ornius Rider'));

    expect(stayed.classId).toBe(classId('Gladiator'));
    expect(switched.classId).toBe(classId('Ornius Rider'));
    expect(page.availableClasses(stayed).map((unitClass) => unitClass.name)).toContain('Ornius Rider');
    expect(Object.values(page.examBoostOf(stayed)).every((boost) => boost === 0)).toBeTrue();
    expect(page.rollsAt(stayed.exam!.slot)[1].text).toBe('≤40%');

    state.addExamLevel(seed().id, { classId: classId('Diviner'), chance: 30, passed: true, keepClass: true });
    expect(page.rowClassId(seedView(), seed().rows.length - 1)).toBe(classId('Gladiator'));

    const serializer = TestBed.inject(SeedSerializerService);
    const loaded = serializer.fromDto(serializer.toDto(state.snapshot()));
    state.reset();
    state.restore(loaded, null);

    expect(state.seedMap().sections[1].exam!.keepClass).toBeTrue();
    expect(seed().rows.at(-1)!.exam!.keepClass).toBeTrue();
  });

  describe('bad level ups', () => {
    const str = STAT_KEYS.indexOf('str');
    const mark = (sectionId: number, rowIndex: number, ...stats: StatKey[]) => {
      const row = state.seedMap().sections.find((section) => section.id === sectionId)!.rows[rowIndex];
      stats.forEach((stat) => state.toggleStat(sectionId, row.id, stat));
    };
    const lv13Slot = () => page.slotOf(seedView(), 11);

    it("shows '?' for a roll only a 1–2 stat level up used, and doesn't force an exam on it", () => {
      mark(seed().id, 11, 'hp', 'def');

      expect(page.rollsAt(lv13Slot())[str].text).toBe('?');
      page.openBranchAt(seedView(), 11);
      expect(page.examDialog()!.strBounds).toEqual({ lower: null, upper: null });

      mark(seed().id, 11, 'spd');
      const strGrowth = page.rowGrowth(seedView(), 11)!.str;

      expect(page.rollsAt(lv13Slot())[str].text).toBe(`>${strGrowth}%`);
      page.openBranchAt(seedView(), 11);
      expect(page.examDialog()!.strBounds).toEqual({ lower: strGrowth, upper: null });
    });

    it('fills the other level ups on a roll in once one reliable (3+ stat) level up used it', () => {
      const easyStr = { ...ZERO_GROWTH, str: 100 };
      const blank = { id: -1, marks: { ...ZERO_GROWTH } };
      const autoStr = () => page.effectiveRow(easyStr, blank, lv13Slot()).auto.str;

      mark(seed().id, 11, 'str', 'def');
      expect(autoStr()).toBeFalse();

      state.addAvailableClass(classId('Hunter'));
      const hunter = state.addBranch(seed().id, lv12(), { classId: classId('Hunter'), chance: 0, passed: true, reclass: true })!;
      mark(hunter, 0, 'str', 'dex', 'def');

      expect(page.slotOf(view(hunter), 0)).toBe(lv13Slot());
      expect(autoStr()).toBeTrue();
    });
  });

  it("doesn't offer a class another branch at the same level already took", () => {
    exam('Ornius Rider');
    page.openBranchAt(seedView(), 11);
    const names = page.examDialog()!.classGroups.flatMap((group) => group.items.map((item) => item.name));

    expect(names).not.toContain('Ornius Rider');
    expect(names).toContain('Diviner');
  });

  it('only offers exam classes unlocked by the level, and tells the dialog that level', () => {
    const ranks = () => page.examDialog()!.classGroups.map((group) => group.label);

    page.openBranchAt(seedView(), 11);
    expect(page.examDialog()!.level).toBe(13);
    expect(ranks()).not.toContain('Speciality');

    for (let index = 0; index < 4; index++) {
      state.addLevel(seed().id);
    }

    page.openBranchAt(seedView(), 14);
    expect(page.examDialog()!.level).toBe(16);
    expect(ranks()).toContain('Speciality');
  });

  it('lets an exam action add another exam at a level that already branches', () => {
    exam('Diviner');

    expect(page.canTakeExamAtRow(seedView(), 11)).toBeTrue();
    page.openExamAt(seedView(), 11);
    page.onExamConfirmed({ classId: classId('Gladiator'), chance: 40, passed: true });

    const branches = state.seedMap().sections.filter((section) => section.exam?.afterRowId === lv12());
    expect(branches.map((section) => section.exam!.classId)).toEqual([classId('Diviner'), classId('Gladiator')]);
  });

  it('projects stats from the end of a branch, in the class it ends in', () => {
    STAT_KEYS.forEach((stat) => state.setStartStat(stat, 10));
    state.toggleStat(seed().id, seed().rows[0].id, 'str');
    const branch = view(exam('Gladiator'));

    expect(page.canProject(branch)).toBeTrue();
    page.openProjection(branch);

    const start = page.projection()!.start;
    expect(page.projection()!.unit.name).toBe('Cai');
    expect(start.level).toBe(page.endLevelOf(branch));
    expect(start.className).toBe('Gladiator');
    expect(start.stats.str).toBe(11 + page.examBoostOf(branch).str);
  });
});

describe('SeedTimelineComponent', () => {
  let state: SeedMapperStateService;

  const seed = () => state.seedMap().sections[0];

  const render = () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SeedMapperPageComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(SeedMapperPageComponent);
    state = TestBed.inject(SeedMapperStateService);
    state.reset();
    state.setUnit(unitId('Cai'));
    state.addLevel(seed().id);
    state.addLevel(seed().id);
    fixture.detectChanges();

    return { fixture, page: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  };
  const toggleButton = (host: HTMLElement, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.page-header button')).find((button) =>
      button.textContent!.includes(label),
    );

  it('only offers the timeline view, without a section view toggle', () => {
    const { host } = render();

    expect(host.querySelector('app-seed-timeline')).not.toBeNull();
    expect(host.querySelector('.seed-group')).toBeNull();

    expect(toggleButton(host, 'Section view')).toBeUndefined();
    expect(toggleButton(host, 'Timeline view')).toBeUndefined();
    expect(host.querySelector('[aria-label="Seed setup"]')).not.toBeNull();
    expect(host.querySelector('.saves')).not.toBeNull();
  });

  it('only shows class helper text in the growth row, not beneath each level', () => {
    const { host } = render();

    expect(host.querySelectorAll('.tgrid-level-line').length).toBeGreaterThan(0);
    for (const label of host.querySelectorAll('.tgrid-level-line')) {
      expect(label.parentElement!.querySelector('.tgrid-class')).toBeNull();
    }
    const classLabels = host.querySelectorAll('.tgrid-class');
    expect(classLabels.length).toBeGreaterThan(0);
    for (const label of classLabels) {
      expect(label.closest('.tgrid-band--growth')).not.toBeNull();
    }
  });

  it('opens equipment for the focused timeline', () => {
    const { fixture, page, host } = render();
    const equipmentButton = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent!.includes('Inventory ('))!;
    equipmentButton().click();
    fixture.detectChanges();
    expect(page.equipmentSectionId()).toBe(seed().id);
    expect(host.querySelector('app-equipment-dialog')).not.toBeNull();
    page.onEquipmentConfirmed(['Wooden Sword']);
    fixture.detectChanges();
    expect(equipmentButton().textContent).toContain('1/5');
    expect(equipmentButton().title).toBe('Wooden Sword');
    equipmentButton().click();
    fixture.detectChanges();
    expect(host.querySelector('app-equipment-dialog')).not.toBeNull();
  });

  it('labels each timeline with only its final branch action', () => {
    const { fixture, page, host } = render();
    const first = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Diviner'), chance: 40, passed: true })!;
    const firstSection = state.seedMap().sections.find((section) => section.id === first)!;
    const second = state.addBranch(first, firstSection.rows[0].id, { classId: classId('Gladiator'), chance: 40, passed: false })!;
    state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Hunter'), chance: 0, passed: true, reclass: true });
    fixture.detectChanges();

    const options = Array.from(host.querySelectorAll<HTMLOptionElement>('.timeline-select option')).map((option) => option.textContent!.trim());
    const secondView = page.sectionViews().find((view) => view.section.id === second)!;
    expect(options[0]).toBe('Current');
    expect(options[1]).toBe('Seed');
    expect(options[2]).toContain('Diviner ✓ Lv');
    expect(options[3]).toBe(`→ Gladiator ✗ Lv ${secondView.firstLevel}`);
    expect(options[4]).toContain('↻ Hunter Lv');
  });

  it('defaults to the latest timeline and lets Current follow new branches', () => {
    const { fixture, host } = render();
    const first = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Diviner'), chance: 40, passed: true })!;
    fixture.detectChanges();

    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    const select = host.querySelector<HTMLSelectElement>('.timeline-select')!;
    expect(select.value).toBe('current');
    expect(timeline.focused()!.section.id).toBe(first);

    select.value = String(seed().id);
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(timeline.focused()!.section.id).toBe(seed().id);

    select.value = 'current';
    select.dispatchEvent(new Event('change'));
    const second = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Gladiator'), chance: 40, passed: false })!;
    fixture.detectChanges();
    expect(select.value).toBe('current');
    expect(timeline.focused()!.section.id).toBe(second);

  });

  for (const reclass of [false, true]) {
    for (const selected of [false, true]) {
      it(`appends a ${reclass ? 'reclass' : 'exam'} to ${selected ? 'the selected branch' : 'Current'} from the header`, () => {
        const { fixture, page, host } = render();
        const first = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Diviner'), chance: 40, passed: false })!;
        const latest = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Gladiator'), chance: 40, passed: false })!;
        state.addAvailableClass(classId('Hunter'));
        fixture.detectChanges();

        const select = host.querySelector<HTMLSelectElement>('.timeline-select')!;
        select.value = selected ? String(first) : 'current';
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        const targetId = selected ? first : latest;
        const target = () => page.sectionViews().find((view) => view.section.id === targetId)!;
        const counts = new Map(state.seedMap().sections.map((section) => [section.id, section.rows.length]));
        const button = toggleButton(host, 'Exam / Reclass')!;
        expect(button.disabled).toBeFalse();
        expect(button.title).toContain(target().title);
        button.click();
        fixture.detectChanges();

        expect(page.examDialog()!.parentId).toBe(targetId);
        expect(page.examDialog()!.inline).toBeTrue();
        page.onExamConfirmed({ classId: classId('Hunter'), chance: 40, passed: true, reclass });
        fixture.detectChanges();

        for (const section of state.seedMap().sections) {
          expect(section.rows.length).toBe(counts.get(section.id)! + (section.id === targetId ? 1 : 0));
        }
        const row = target().section.rows.at(-1)!;
        if (reclass) {
          expect(row.reclassTo).toBe(classId('Hunter'));
        } else {
          expect(row.exam!.classId).toBe(classId('Hunter'));
        }
      });
    }
  }

  it('uses the selected timeline level limit for the header action and hint', () => {
    const { fixture, page, host } = render();
    const branchId = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Diviner'), chance: 40, passed: false })!;
    const branch = () => page.sectionViews().find((view) => view.section.id === branchId)!;
    while (page.endLevelOf(branch()) < MAX_LEVEL) {
      state.addLevel(branchId);
    }
    fixture.detectChanges();

    const button = toggleButton(host, 'Exam / Reclass')!;
    expect(button.disabled).toBeTrue();
    expect(button.title).toBe(`There is no level after Lv ${MAX_LEVEL}`);

    const select = host.querySelector<HTMLSelectElement>('.timeline-select')!;
    select.value = String(seed().id);
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(button.disabled).toBeFalse();
    expect(button.title).toContain('Seed');
    button.click();
    expect(page.examDialog()!.parentId).toBe(seed().id);
  });

  it('returns to Current when a map is loaded', () => {
    const { fixture, page, host } = render();
    const branch = state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Diviner'), chance: 40, passed: true })!;
    fixture.detectChanges();
    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    timeline.focusBranch(seed().id);
    fixture.detectChanges();

    page.timelineResetVersion.update((version) => version + 1);
    fixture.detectChanges();
    expect(timeline.focused()!.section.id).toBe(branch);
    expect(host.querySelector<HTMLSelectElement>('.timeline-select')!.value).toBe('current');
  });

  it('focuses a newly confirmed branch when a timeline is explicitly selected', () => {
    const { fixture, page } = render();
    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    timeline.focusBranch(seed().id);
    fixture.detectChanges();

    page.openBranchAt(page.sectionViews()[0], 0);
    page.onExamConfirmed({ classId: classId('Diviner'), chance: 40, passed: true });
    fixture.detectChanges();

    expect(timeline.focused()!.section.id).toBe(state.seedMap().sections.at(-1)!.id);
    expect(timeline.focused()!.section.id).not.toBe(seed().id);
  });

  it('shows one timeline with a switcher where exams branch off, locking rows the branch shares', () => {
    const { fixture, page, host } = render();
    const afterRow = seed().rows[0].id;
    state.addBranch(seed().id, afterRow, { classId: classId('Diviner'), chance: 40, passed: true });
    state.addBranch(seed().id, afterRow, { classId: classId('Gladiator'), chance: 40, passed: true });

    fixture.detectChanges();

    expect(host.querySelector('app-seed-timeline')).not.toBeNull();
    expect(host.querySelector('.seed-group')).toBeNull();

    const chips = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.tgrid-fork .chip'));
    expect(chips().map((chip) => chip.textContent!.trim())).toEqual(['No branch', 'Diviner ✓', 'Gladiator ✓']);

    chips()[2].click();
    fixture.detectChanges();

    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    const levels = timeline.items().flatMap((item) => (item.kind === 'level' ? [item] : []));

    expect(timeline.focused()!.title).toBe('Exam 2');
    expect(levels.map((level) => [level.level, level.editable])).toEqual([
      [2, false],
      [3, true],
    ]);
    expect(host.querySelector('.tgrid-branch-label')!.textContent).toContain('Gladiator exam passed');

    const strCells = Array.from(host.querySelectorAll<HTMLButtonElement>('.tgrid .cell')).filter((cell) =>
      cell.getAttribute('aria-label')!.startsWith('Str'),
    );
    expect(strCells[0].disabled).toBeTrue();
    strCells[1].click();
    fixture.detectChanges();

    expect(page.sectionViews()[2].section.rows[0].marks.str).toBe(1);
  });

  it('shows growth rates at the start and again where a branch changes class', () => {
    const { fixture, host } = render();
    state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Gladiator'), chance: 40, passed: true });
    fixture.detectChanges();

    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    timeline.focusBranch(state.seedMap().sections[1].id);
    fixture.detectChanges();

    const labels = Array.from(host.querySelectorAll('.tgrid-label')).map((label) =>
      Array.from(label.children).map((part) => part.textContent!.trim()).join(' '),
    );
    expect(labels.filter((label) => label.startsWith('Growth'))).toEqual(['Growth Noble/Commoner', 'Growth Gladiator']);
    expect(host.querySelectorAll('.tgrid-growth').length).toBe(2 * STAT_KEYS.length);
  });

  it('highlights Mu’s personal growth bonuses but not class growth alone', () => {
    const { fixture, host } = render();
    state.setUnit(unitId('Mu'));
    fixture.detectChanges();
    const cells = host.querySelectorAll<HTMLElement>('.tgrid-growth');
    expect(cells.length).toBe(STAT_KEYS.length);
    for (const cell of Array.from(cells)) {
      expect(cell.querySelector('.stat-bonus')).not.toBeNull();
      expect(cell.title).toContain('Modifier +20%');
    }
    state.setUnit(unitId('Cai'));
    state.setClass(seed().id, classId('Gladiator'));
    fixture.detectChanges();
    expect(host.querySelector('.tgrid-growth .stat-bonus')).toBeNull();
  });

  it('highlights mount growth contributions and updates them when changing class', () => {
    const { fixture, page, host } = render();
    state.addAvailableClass(classId('Ornius Rider'));
    page.onClassChange(page.sectionViews()[0], classId('Ornius Rider'));
    fixture.detectChanges();
    const mount = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    page.onMountChange(page.sectionViews()[0], mount.id);
    fixture.detectChanges();
    const view = page.sectionViews()[0];
    expect(view.mount).not.toBeNull();
    const mountGrowth = mountGrowthAt(view.mount, view.mountLevel);
    expect(STAT_KEYS.some((stat) => mountGrowth[stat] > 0)).toBeTrue();
    const cells = host.querySelectorAll<HTMLElement>('.tgrid-growth');
    STAT_KEYS.forEach((stat, index) => {
      expect(cells[index].querySelector('.stat-bonus') !== null).toBe(mountGrowth[stat] > 0);
      expect(cells[index].title).toContain(`Modifier ${mountGrowth[stat] >= 0 ? '+' : ''}${mountGrowth[stat]}%`);
    });

    state.setClass(seed().id, classId('Gladiator'));
    fixture.detectChanges();
    expect(host.querySelector('.tgrid-growth .stat-bonus')).toBeNull();
  });

  for (const name of ['Charioteer', 'Elephant Rider']) {
    it(`applies ${name} gates after the level reaching 35 and 45, including timeline breakdowns`, () => {
      const { fixture, page, host } = render();
      const id = classId(name);
      state.addAvailableClass(id);
      state.setStatsLevel(33);
      page.onClassChange(page.sectionViews()[0], id);
      while (seed().rows.length < 13) {
        state.addLevel(seed().id);
      }
      fixture.detectChanges();

      const view = page.sectionViews()[0];
      const at = (level: number) => page.rowGrowth(view, level - view.firstLevel)!;
      const config = CLASS_LEVEL_CONFIGS[name];
      const base = at(34);
      for (const level of [34, 35, 36, 44, 45, 46]) {
        const bonus = toGrowth(config.bonuses[level > 45 ? 45 : level > 35 ? 35 : config.levels[0]]);
        expect(at(level)).withContext(`Lv ${level}`).toEqual(sumGrowth(base, bonus));
        const details = page.rowGrowthDetails(view, level - view.firstLevel);
        const unitClass = classes.find((candidate) => candidate.id === id)!;
        expect(details.hp.title).toContain(`Class +${unitClass.hp + bonus.hp}%`);
        expect(details.hp.boosted).toBeFalse();
      }
      const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
      const growthRows = timeline.items().filter((item) => item.kind === 'growth');
      expect(growthRows.length).toBe(name === 'Charioteer' ? 3 : 2);
      const items = timeline.items();
      expect(growthRows.slice(1).map((growth) => {
        const next = items[items.indexOf(growth) + 1];
        return next.kind === 'level' ? next.level : null;
      })).toEqual(name === 'Charioteer' ? [36, 46] : [46]);
      expect(host.querySelectorAll('.tgrid-band--growth').length).toBe(growthRows.length);
    });
  }

  it('uses the pre-level-up level for class gates on branches and inline class changes', () => {
    const { fixture, page } = render();
    state.setStatsLevel(33);
    const id = state.addBranch(seed().id, seed().rows[0].id, {
      classId: classId('Charioteer'), chance: 100, passed: true,
    })!;
    const view = () => page.sectionViews().find((candidate) => candidate.section.id === id)!;
    while (view().section.rows.length < 12) {
      state.addLevel(id);
    }
    state.addAvailableClass(classId('Elephant Rider'));
    const classGrowth = (name: string) => {
      const unit = unitData.find((candidate) => candidate.id === unitId('Cai'))!;
      return sumGrowth(toGrowth(unit), toGrowth(classes.find((candidate) => candidate.name === name)));
    };
    fixture.detectChanges();
    expect(view().firstLevel).toBe(35);
    expect(page.rowGrowth(view(), 0)).toEqual(classGrowth('Charioteer'));
    expect(page.rowGrowth(view(), 1)).toEqual(sumGrowth(classGrowth('Charioteer'), toGrowth(CLASS_LEVEL_CONFIGS['Charioteer'].bonuses[35])));
    state.setReclass(id, view().section.rows[10].id, classId('Elephant Rider'));
    fixture.detectChanges();
    expect(page.levelOf(view(), 10)).toBe(45);
    expect(page.rowGrowth(view(), 10)).toEqual(classGrowth('Elephant Rider'));
    expect(page.rowGrowth(view(), 11)).toEqual(sumGrowth(classGrowth('Elephant Rider'), toGrowth(CLASS_LEVEL_CONFIGS['Elephant Rider'].bonuses[45])));
  });

  it('doubles selected Charioteer mount growth through bond changes and class gates', () => {
    const { fixture, page } = render();
    const id = classId('Charioteer');
    state.addAvailableClass(id);
    state.setStatsLevel(43);
    page.onClassChange(page.sectionViews()[0], id);
    fixture.detectChanges();
    const view = () => page.sectionViews()[0];
    const mount = page.mountsForClass(id).find((candidate) =>
      STAT_KEYS.some((stat) => mountGrowthAt(candidate, candidate.bondLevels.at(-1)?.level)[stat] > 0),
    )!;
    expect(mount).toBeDefined();
    const base = page.rowGrowth(view(), 0)!;
    const previous = page.rowMount(view(), 0);
    const level = mount.bondLevels.at(-1)?.level ?? null;
    page.onRowMountChange(view(), 1, mount.id);
    if (level !== null) {
      page.onRowMountLevelChange(view(), 1, String(level));
    }
    fixture.detectChanges();

    const config = CLASS_LEVEL_CONFIGS['Charioteer'];
    const mountOnly = sumGrowth(
      base,
      scaleGrowth(mountGrowthAt(previous.mount, previous.level), -2),
      scaleGrowth(mountGrowthAt(mount, level), 2),
    );
    const expected = sumGrowth(
      mountOnly,
      scaleGrowth(toGrowth(config.bonuses[35]), -1),
      toGrowth(config.bonuses[45]),
    );
    expect(page.rowGrowth(view(), 0)).toEqual(base);
    expect(page.rowGrowth(view(), 1)).toEqual(mountOnly);
    expect(page.rowGrowth(view(), 2)).toEqual(expected);
    for (const stat of STAT_KEYS) {
      const modifier = mountGrowthAt(mount, level)[stat] * 2;
      expect(page.rowGrowthDetails(view(), 1)[stat].title).toContain(`Modifier +${modifier}%`);
    }
  });

  it('lets the focused branch change mounts and bond levels without changing the seed', () => {
    const { fixture, page, host } = render();
    const branch = state.addBranch(seed().id, seed().rows[0].id, {
      classId: classId('Ornius Rider'), chance: 100, passed: true,
    })!;
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.mount-button')!.click();
    fixture.detectChanges();
    const mount = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    const picker = fixture.debugElement.queryAll(By.directive(SearchableSelectComponent))
      .map((element) => element.componentInstance as SearchableSelectComponent)
      .find((select) => select.label() === 'Mount')!;
    picker.valueChange.emit(mount.id);
    fixture.detectChanges();
    const view = page.sectionViews().find((view) => view.section.id === branch)!;
    expect(page.rowMount(view, 0).mount?.id).toBe(mount.id);
    expect(seed().mountId).toBeNull();
    const bond = host.querySelector<HTMLSelectElement>('.timeline select[aria-label="Bond Level"]')!;
    expect(bond).not.toBeNull();
    bond.value = bond.options[bond.options.length - 1].value;
    bond.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(state.seedMap().sections.find((section) => section.id === branch)!.rows[0].mount?.mountLevel).toBe(Number(bond.value));
  });

  it('updates mounts and bonds from a chosen level onward, leaving earlier levels unchanged', () => {
    const { fixture, page, host } = render();
    state.addAvailableClass(classId('Ornius Rider'));
    page.onClassChange(page.sectionViews()[0], classId('Ornius Rider'));
    state.addLevel(seed().id);
    fixture.detectChanges();
    const currentView = () => page.sectionViews()[0];
    const original = page.rowMount(currentView(), 0).mount!;
    const originalGrowth = page.rowGrowth(currentView(), 0)!;
    const wild = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    const white = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'White Ornius')!;
    const buttons = () => host.querySelectorAll<HTMLButtonElement>('.mount-button');
    const icons = () => Array.from(buttons()).map((button) => button.querySelector('img')!.getAttribute('src'));
    expect(buttons().length).toBe(4);
    expect(icons()).toEqual(Array(4).fill(skillIconUrl('riding', 'bad')));
    buttons()[1].click();
    fixture.detectChanges();
    expect(icons()[1]).toBe(skillIconUrl('riding', 'neutral'));
    expect(buttons()[1].classList.contains('mount-button--selected')).toBeTrue();
    expect(getComputedStyle(buttons()[1]).borderTopColor).toBe('rgb(240, 192, 74)');
    const picker = fixture.debugElement.queryAll(By.directive(SearchableSelectComponent))
      .find((element) => element.nativeElement.closest('.tgrid-mount-editor'))!
      .componentInstance as SearchableSelectComponent;
    picker.valueChange.emit(wild.id);
    fixture.detectChanges();
    let bond = host.querySelector<HTMLSelectElement>('.tgrid-mount-editor select')!;
    bond.value = '5';
    bond.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.rowMount(currentView(), 0).mount?.id).toBe(original.id);
    expect(page.rowGrowth(currentView(), 0)).toEqual(originalGrowth);
    expect(page.rowMount(currentView(), 1)).toEqual({ mount: wild, level: 5 });
    expect(page.rowMount(currentView(), 3)).toEqual({ mount: wild, level: 5 });
    expect(page.rowGrowth(currentView(), 1)!.spd - originalGrowth.spd).toBe(10);
    expect(page.rowGrowth(currentView(), 1)!.dex - originalGrowth.dex).toBe(15);
    expect(host.querySelectorAll('.tgrid-growth').length).toBe(2 * STAT_KEYS.length);
    expect(icons()).toEqual([
      skillIconUrl('riding', 'bad'),
      skillIconUrl('riding', 'neutral'),
      skillIconUrl('riding', 'good'),
      skillIconUrl('riding', 'good'),
    ]);

    buttons()[2].click();
    fixture.detectChanges();
    expect(icons()[1]).toBe(skillIconUrl('riding', 'good'));
    expect(buttons()[1].classList.contains('mount-button--selected')).toBeFalse();
    expect(icons()[2]).toBe(skillIconUrl('riding', 'neutral'));
    bond = host.querySelector<HTMLSelectElement>('.tgrid-mount-editor select')!;
    expect(bond.value).toBe('5');
    page.onRowMountChange(currentView(), 2, white.id);
    page.onRowMountLevelChange(currentView(), 2, '2');
    fixture.detectChanges();
    expect(page.rowMount(currentView(), 1)).toEqual({ mount: wild, level: 5 });
    expect(page.rowMount(currentView(), 2)).toEqual({ mount: white, level: 2 });
    expect(page.rowMount(currentView(), 3)).toEqual({ mount: white, level: 2 });
    expect(page.rowGrowth(currentView(), 2)!.res - originalGrowth.res).toBe(5);
    const reset = Array.from(host.querySelectorAll<HTMLButtonElement>('.tgrid-mount-editor button'))
      .find((button) => button.textContent!.includes('Use previous mount'))!;
    reset.click();
    fixture.detectChanges();
    expect(seed().rows[2].mount).toBeUndefined();
    expect(page.rowMount(currentView(), 3)).toEqual({ mount: wild, level: 5 });
    buttons()[2].click();
    fixture.detectChanges();
    expect(icons()[2]).toBe(skillIconUrl('riding', 'good'));
    page.onRowMountChange(currentView(), 2, original.id);
    fixture.detectChanges();
    expect(icons()[1]).toBe(skillIconUrl('riding', 'good'));
    expect(icons()[2]).toBe(skillIconUrl('riding', 'bad'));
    expect(icons()[3]).toBe(skillIconUrl('riding', 'bad'));
  });

  it('uses per-level mounts in ending stat bonuses and projected history, and excludes them for foot classes', () => {
    const { fixture, page, host } = render();
    STAT_KEYS.forEach((stat) => state.setStartStat(stat, 20));
    state.addAvailableClass(classId('Ornius Rider'));
    page.onClassChange(page.sectionViews()[0], classId('Ornius Rider'));
    state.addLevel(seed().id);
    fixture.detectChanges();
    const currentView = () => page.sectionViews()[0];
    const wild = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    const before = page.endStatsOf(currentView());
    page.onRowMountChange(currentView(), 1, wild.id);
    page.onRowMountLevelChange(currentView(), 1, '5');
    fixture.detectChanges();
    const after = page.endStatsOf(currentView());
    expect(after[STAT_KEYS.indexOf('spd')].value! - before[STAT_KEYS.indexOf('spd')].value!).toBe(2);
    expect(after[STAT_KEYS.indexOf('dex')].value! - before[STAT_KEYS.indexOf('dex')].value!).toBe(3);
    page.openProjection(currentView());
    const steps = page.projection()!.history.steps;
    expect(steps[0].mount?.name).toBe('Ornius');
    expect(steps[1].mount?.id).toBe(wild.id);
    expect(steps[1].bondLevel).toBe(5);
    page.projection.set(null);

    page.onMountChange(currentView(), wild.id);
    state.addAvailableClass(classId('Gladiator'));
    state.addReclassLevel(seed().id, classId('Gladiator'));
    fixture.detectChanges();
    const footRowIndex = seed().rows.length - 1;
    expect(page.rowMount(currentView(), footRowIndex).mount).toBeNull();
    expect(host.querySelectorAll('.mount-button').length).toBe(4);
    expect(page.rowGrowthDetails(currentView(), footRowIndex).spd.boosted).toBeFalse();
    expect(page.endStatsOf(currentView()).every((total) => total.mountBonus === 0)).toBeTrue();
  });

  it('preserves level mount changes through saves and inherits the mount at a branch point', () => {
    const { fixture, page, host } = render();
    state.addAvailableClass(classId('Ornius Rider'));
    page.onClassChange(page.sectionViews()[0], classId('Ornius Rider'));
    state.addLevel(seed().id);
    state.addLevel(seed().id);
    fixture.detectChanges();
    const wild = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    page.onRowMountChange(page.sectionViews()[0], 1, wild.id);
    page.onRowMountLevelChange(page.sectionViews()[0], 1, '4');
    const branchId = state.addBranch(seed().id, seed().rows[1].id, {
      classId: classId('Diviner'), chance: 20, passed: false,
    })!;
    fixture.detectChanges();
    let branch = page.sectionViews().find((view) => view.section.id === branchId)!;
    expect(page.rowMount(branch, 0)).toEqual({ mount: wild, level: 4 });
    const ancestorButtons = host.querySelectorAll<HTMLButtonElement>('.mount-button');
    expect(ancestorButtons[0].disabled).toBeTrue();
    expect(ancestorButtons[1].disabled).toBeTrue();
    expect(ancestorButtons[2].disabled).toBeFalse();
    page.onRowMountLevelChange(branch, 0, '5');
    expect(page.rowMount(page.sectionViews()[0], 2).level).toBe(4);

    const serializer = TestBed.inject(SeedSerializerService);
    const dto = serializer.toDto(state.snapshot());
    expect(dto.sections[0].mountChanges).toEqual([{ row: 1, mount: 'Wild Ornius', mountLevel: 4 }]);
    expect(serializer.missingNames(dto)).toEqual([]);
    const loaded = migrateSave(JSON.parse(JSON.stringify({ version: 2, seed: dto })));
    state.restore(serializer.fromDto(loaded.seed), null);
    fixture.detectChanges();
    expect(page.rowMount(page.sectionViews()[0], 0).mount?.name).toBe('Ornius');
    expect(page.rowMount(page.sectionViews()[0], 2)).toEqual({ mount: wild, level: 4 });
    branch = page.sectionViews()[1];
    expect(page.rowMount(branch, 0)).toEqual({ mount: wild, level: 5 });
    dto.sections[0].mountChanges![0].mount = 'Missing mount';
    expect(serializer.missingNames(dto)).toContain('Missing mount');
  });

  it('rejects invalid level mount changes when importing saves and accepts older saves', () => {
    const { page } = render();
    const serializer = TestBed.inject(SeedSerializerService);
    const dto = serializer.toDto(state.snapshot());
    expect(migrateSave({ version: 2, seed: dto }).seed.sections[0].mountChanges).toBeUndefined();
    for (const change of [
      { row: -1, mount: 'Wild Ornius', mountLevel: 1 },
      { row: 99, mount: 'Wild Ornius', mountLevel: 1 },
      { row: 0, mount: 'Wild Ornius', mountLevel: 0 },
      { row: 0, mount: 42, mountLevel: 1 },
    ]) {
      const invalid = { ...dto, sections: [{ ...dto.sections[0], mountChanges: [change] }] };
      expect(() => migrateSave({ version: 2, seed: invalid })).toThrowError();
    }
    dto.sections[0].mountChanges = [
      { row: 0, mount: 'Wild Ornius', mountLevel: 1 },
      { row: 0, mount: 'Wild Ornius', mountLevel: 2 },
    ];
    expect(() => migrateSave({ version: 2, seed: dto })).toThrowError();
  });

  it('keeps mount overrides when restoring and folding a single end-of-timeline exam', () => {
    const { fixture, page } = render();
    state.addAvailableClass(classId('Ornius Rider'));
    page.onClassChange(page.sectionViews()[0], classId('Ornius Rider'));
    fixture.detectChanges();
    const wild = page.mountsForClass(classId('Ornius Rider')).find((mount) => mount.name === 'Wild Ornius')!;
    page.onRowMountChange(page.sectionViews()[0], 2, wild.id);
    page.onRowMountLevelChange(page.sectionViews()[0], 2, '4');
    const branchId = state.addExam(seed().id, seed().rows[2].id, {
      classId: classId('Diviner'), chance: 20, passed: false,
    })!;
    fixture.detectChanges();
    const branch = page.sectionViews().find((view) => view.section.id === branchId)!;
    page.onRowMountLevelChange(branch, 0, '5');
    state.restore(state.snapshot(), null);
    fixture.detectChanges();
    expect(page.sectionViews().length).toBe(1);
    expect(seed().rows[3].exam?.passed).toBeFalse();
    expect(page.rowMount(page.sectionViews()[0], 2)).toEqual({ mount: wild, level: 4 });
    expect(page.rowMount(page.sectionViews()[0], 3)).toEqual({ mount: wild, level: 5 });
  });

  it('marks modified totals gold with an up arrow and a capped breakdown', () => {
    const { fixture, page, host } = render();
    STAT_KEYS.forEach((stat) => state.setStartStat(stat, 20));
    state.addAvailableClass(classId('The Blade'));
    state.setAbilities(seed().id, ['Divine Insight']);
    fixture.detectChanges();
    const totals = page.endStatsOf(page.sectionViews()[0]);
    const cells = host.querySelectorAll<HTMLElement>('.tgrid-total');
    const index = STAT_KEYS.indexOf('spd');
    const speed = cells[index].querySelector<HTMLElement>('span')!;
    expect(speed.classList.contains('stat-bonus')).toBeTrue();
    expect(cells[index].title).toContain('Class +0; Modifier +10');
    expect(getComputedStyle(speed).color).toBe('rgb(240, 192, 74)');
    expect(getComputedStyle(speed, '::after').content).toContain('↑');
    expect(getComputedStyle(speed, '::after').position).toBe('absolute');
    const width = speed.getBoundingClientRect().width;
    speed.classList.remove('stat-bonus');
    expect(speed.getBoundingClientRect().width).toBe(width);
    expect(cells[STAT_KEYS.indexOf('hp')].querySelector('.stat-bonus')).toBeNull();
    expect(totals[index].value).toBeGreaterThanOrEqual(30);
  });
});
