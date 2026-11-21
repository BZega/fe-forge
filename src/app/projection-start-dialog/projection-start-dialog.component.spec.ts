import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ClassPlanComponent } from '../class-plan/class-plan.component';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { STAT_KEYS, Unit, UnitClass } from '../models/growth.models';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ProjectionStart, ProjectionStartDialogComponent } from './projection-start-dialog.component';

const units = unitData as Pick<Unit, 'id' | 'name'>[];
const unitId = (name: string) => units.find((unit) => unit.name === name)!.id;

describe('ProjectionStartDialogComponent', () => {
  beforeEach(() => TestBed.inject(SpoilerService).setAllHidden(false));

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const open = (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(ProjectionStartDialogComponent);
    let confirmed: ProjectionStart | null = null;
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.componentInstance.confirmed.subscribe((start) => (confirmed = start));
    fixture.detectChanges();

    return { fixture, dialog: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, confirmed: () => confirmed };
  };

  it('only lists characters with chapter stats for Recruitment, leaving out boosted variants like Mu*', () => {
    const { dialog } = open();
    const recruitment = TestBed.inject(RecruitmentDataService);
    const expected = units
      .filter((unit) => unit.name !== 'Mu*' && recruitment.routesWithChapters(unit.name).length > 0)
      .map((unit) => unit.name);

    expect(dialog.characters().map((unit) => unit.name)).toEqual(jasmine.arrayWithExactContents(expected));
    expect(expected).toContain('Cai');
  });

  it("doesn't open the on-screen keyboard for the dropdowns in either mode", () => {
    const { dialog, fixture, host } = open();
    const characterBox = () => host.querySelector('input[aria-label="Character"]')!;

    expect(characterBox().getAttribute('inputmode')).toBe('none');
    dialog.setSource('manual');
    fixture.detectChanges();
    expect(characterBox().getAttribute('inputmode')).toBe('none');
  });

  it("starts from a recruitment chapter, projecting Mu from Mu*'s growths", () => {
    const { dialog, fixture, host, confirmed } = open();
    const confirm = () => host.querySelector<HTMLButtonElement>('.button--primary')!;

    expect(confirm().disabled).toBeTrue();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Mu'));
    fixture.detectChanges();
    confirm().click();

    const start = confirmed()!;
    expect(start.source).toBe('chapter');
    expect(start.name).toBe('Mu');
    expect(start.unit.name).toBe('Mu');
    expect(start.unit.hp).toBe((unitData as { name: string; hp: number }[]).find((unit) => unit.name === 'Mu*')!.hp);
    expect(start.chapters).toBe(dialog.route()!.chapters);
    expect(start.level).toBe(dialog.chapter()!.level);
  });

  it('switches to Manual with the character carried over and their Lv 1 base stats, until a level is typed in', () => {
    const { dialog, fixture, host, confirmed } = open();
    expect(dialog.source()).toBe('manual');
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    dialog.setSource('manual');
    fixture.detectChanges();

    expect(dialog.manualUnitId()).toBe(unitId('Cai'));
    expect(dialog.manualStats()).toEqual({ hp: 27, str: 10, mag: 7, spd: 8, dex: 8, def: 6, res: 5, lck: 6, cha: 5 });

    const level = host.querySelector<HTMLInputElement>('input[aria-label="Starting level"]')!;
    level.value = '12';
    level.dispatchEvent(new Event('change'));
    dialog.pickManualUnit(unitId('Peter'));
    expect(dialog.manualStats().str).toBe(10);

    dialog.useBaseStats();
    expect(dialog.manualLevel()).toBe(1);
    expect(dialog.manualStats().str).toBe(9);

    dialog.confirm();
    expect(confirmed()!).toEqual(jasmine.objectContaining({ source: 'manual', name: 'Peter', level: 1, baseStats: true }));
    expect(STAT_KEYS.every((stat) => confirmed()!.stats[stat] !== null)).toBeTrue();
  });

  it('asks whether entered stats are base or in-game, with the equipped abilities for in-game stats', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    expect(host.querySelector('.start-kind')).toBeNull();

    const level = host.querySelector<HTMLInputElement>('input[aria-label="Starting level"]')!;
    level.value = '20';
    level.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.querySelector('.start-kind')).not.toBeNull();
    expect(host.querySelector('.start-kind app-stat-increase-menu')).not.toBeNull();

    dialog.inGameStats.set(true);
    fixture.detectChanges();
    Array.from(host.querySelectorAll<HTMLButtonElement>('app-stat-increase-menu button'))
      .find((button) => button.textContent!.trim() === 'Abilities')!.click();
    fixture.detectChanges();
    expect(host.querySelector('app-picker-dialog')).not.toBeNull();

    dialog.onAbilitiesConfirmed(['Divine Insight']);
    fixture.detectChanges();
    expect(host.querySelector('app-picker-dialog')).toBeNull();
    dialog.confirm();
    fixture.detectChanges();
    expect(confirmed()).toBeNull();
    expect(host.querySelector('.warning-dialog')!.textContent).toContain('Divine Insight');
    expect(host.querySelector('.warning-dialog')!.textContent).toContain('The Blade');
    dialog.finishConfirm();
    expect(confirmed()!.inGameStats).toBeTrue();
    expect(confirmed()!.abilities).toEqual([]);
    const plan = fixture.debugElement.query(By.directive(ClassPlanComponent)).componentInstance as ClassPlanComponent;
    const gladiator = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Gladiator')!;
    plan.pickClass(plan.plan()[0].id, gladiator.id);
    dialog.onAbilitiesConfirmed(['Attack Basics']);
    fixture.detectChanges();
    dialog.confirm();
    expect(confirmed()!.abilities!.map((ability) => ability.name)).toEqual(['Attack Basics']);
  });

  it("uses Mu's Inventory weapon for an in-game starting build, with no separate weapon selector", () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Mu'));
    fixture.detectChanges();
    const level = host.querySelector<HTMLInputElement>('input[aria-label="Starting level"]')!;
    level.value = '35';
    level.dispatchEvent(new Event('change'));
    dialog.inGameStats.set(true);
    dialog.onAbilitiesConfirmed(["Warrior's Blood"]);
    dialog.onEquipmentConfirmed(['Answerer Huang']);
    fixture.detectChanges();
    expect(dialog.weapon()).toBe('sword');
    expect(host.querySelector('select[aria-label="Equipped weapon"]')).toBeNull();
    dialog.confirm();
    expect(confirmed()!.equipment).toEqual(['Answerer Huang']);
    expect(confirmed()!.weapon).toBe('sword');
    const initial = confirmed()!;
    dialog.onEquipmentConfirmed([]);
    expect(dialog.weapon()).toBeNull();
    dialog.confirm();
    expect(confirmed()!.weapon).toBeNull();

    const restored = open({ initial: { ...initial, equipment: [], weapon: 'axe' } });
    expect(restored.dialog.weapon()).toBeNull();
    restored.dialog.abilityPickerOpen.set(true);
    restored.fixture.detectChanges();
    expect(restored.host.querySelector('app-picker-dialog')!.textContent).toContain('weapon equipped in Inventory');
    expect(restored.host.querySelector('select[aria-label="Equipped weapon"]')).toBeNull();
  });

  it('keeps projected gear chosen for base stats without treating it as part of the entered stats', () => {
    const { dialog, fixture, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const plan = fixture.debugElement.query(By.directive(ClassPlanComponent)).componentInstance as ClassPlanComponent;
    const gladiator = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Gladiator')!;
    plan.pickClass(plan.plan()[0].id, gladiator.id);
    dialog.onAbilitiesConfirmed(['Attack Basics']);
    dialog.onEquipmentConfirmed(['Wooden Sword']);
    fixture.detectChanges();
    dialog.confirm();
    expect(confirmed()!.inGameStats).toBeFalse();
    expect(confirmed()!.abilities!.map((ability) => ability.name)).toEqual(['Attack Basics']);
    expect(confirmed()!.equipment).toEqual(['Wooden Sword']);
  });

  it('offers actual stats to compare for a recruitment start, at the actual level', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    fixture.detectChanges();
    expect(host.querySelector('.start-actuals')).toBeNull();

    host.querySelector<HTMLInputElement>('.start-compare input')!.click();
    fixture.detectChanges();
    const level = host.querySelector<HTMLInputElement>('input[aria-label="Actual stats level"]')!;
    level.value = '25';
    level.dispatchEvent(new Event('change'));
    const str = host.querySelector<HTMLInputElement>('input[aria-label="Actual Str"]')!;
    str.value = '18';
    str.dispatchEvent(new Event('change'));
    dialog.inGameStats.set(true);
    fixture.detectChanges();
    expect(host.querySelector('.start-kind legend')!.textContent).toContain('Actual stats are');

    dialog.confirm();
    expect(confirmed()!.actual).toEqual(jasmine.objectContaining({ level: 25, inGame: true }));
    expect(confirmed()!.actual!.stats.str).toBe(18);
    expect(confirmed()!.options.level).toBe(25);
  });

  it('pulls impossible actuals down to the most possible, then to the equipped bonuses on Done', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    fixture.detectChanges();
    host.querySelector<HTMLInputElement>('.start-compare input')!.click();
    fixture.detectChanges();

    const chapter = dialog.chapter()!;
    const classBonus = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === chapter.className)!.bonusStats.str;
    const field = (aria: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${aria}"]`)!;
    const type = (aria: string, value: string) => {
      field(aria).value = value;
      field(aria).dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    type('Actual stats level', String(chapter.level));
    type('Actual Str', '999');
    expect(dialog.actualInputs().str).toBe(chapter.stats.str);

    dialog.setInGame(true);
    fixture.detectChanges();
    type('Actual Str', '999');
    expect(dialog.actualInputs().str).toBe(chapter.stats.str + classBonus + 10);

    dialog.confirm();
    expect(confirmed()!.actual!.stats.str).toBe(chapter.stats.str + classBonus);
  });

  it('fills an existing start back in when editing', () => {
    const first = open();
    first.dialog.setSource('chapter');
    first.dialog.unitId.set(unitId('Cai'));
    const chapters = first.dialog.route()!.chapters;
    first.dialog.chapterNumber.set(chapters.at(-1)!.chapter);
    first.fixture.detectChanges();
    first.dialog.confirm();

    const { dialog } = open({ initial: first.confirmed() });

    expect(dialog.source()).toBe('chapter');
    expect(dialog.unit()!.name).toBe('Cai');
    expect(dialog.chapterNumber()).toBe(chapters.at(-1)!.chapter);
  });

  it('accounts for used boosters when validating actual stats, without changing the observation', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    dialog.compareActuals.set(true);
    fixture.detectChanges();
    const chapter = dialog.chapter()!;
    dialog.actualLevel.set(chapter.level);
    dialog.onBoostersConfirmed([{ key: null, label: '', counts: { str: 3 } }]);
    fixture.detectChanges();
    const field = host.querySelector<HTMLInputElement>('[aria-label="Actual Str"]')!;
    field.value = String(chapter.stats.str + 6);
    field.dispatchEvent(new Event('change'));
    dialog.confirm();
    expect(confirmed()!.actual!.stats.str).toBe(chapter.stats.str + 6);
    expect(confirmed()!.stats.str).toBe(chapter.stats.str);
    expect(confirmed()!.boosters).toEqual({ str: 3 });
    expect(confirmed()!.baseStats).toBeFalse();
    const edited = open({ initial: confirmed() });
    expect(edited.dialog.boosters()).toEqual({ str: 3 });
  });

  it('keeps manually entered boosted base stats intact instead of adding boosters twice', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const field = host.querySelector<HTMLInputElement>('[aria-label="Starting Str"]')!;
    field.value = '16';
    field.dispatchEvent(new Event('change'));
    dialog.onBoostersConfirmed([{ key: null, label: '', counts: { str: 3 } }]);
    dialog.confirm();
    expect(confirmed()!.stats.str).toBe(16);
    expect(confirmed()!.baseStats).toBeFalse();
    expect(confirmed()!.boosters).toEqual({ str: 3 });
  });

  it('opens the booster modal for untouched app-provided base stats without requiring actual-stat entry', () => {
    const { dialog, fixture, host } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('app-stat-increase-menu button'))
      .find((entry) => entry.textContent?.trim() === 'Items')!;
    expect(button.closest('.start-compare')).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(dialog.entered()).toBeNull();
    expect(host.querySelector('app-stat-booster-dialog')).not.toBeNull();
  });

  it('keeps the stat increase dropdown inside the build dialog at narrow widths', () => {
    const { dialog, fixture, host } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const panel = host.querySelector<HTMLElement>('.dialog--start')!;
    const menu = host.querySelector<HTMLDetailsElement>('.start-compare app-stat-increase-menu details')!;
    panel.style.width = '270px';
    menu.open = true;
    fixture.detectChanges();
    const panelRect = panel.getBoundingClientRect();
    const options = menu.querySelector<HTMLElement>('.stat-menu-options')!;
    const optionsRect = options.getBoundingClientRect();
    expect(optionsRect.left).toBeGreaterThanOrEqual(panelRect.left);
    expect(optionsRect.right).toBeLessThanOrEqual(panelRect.right);
    for (const button of Array.from(options.querySelectorAll<HTMLButtonElement>('button'))) {
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(panelRect.right);
    }
  });

  it('offers stat increases for both base and in-game actuals', () => {
    const { dialog, fixture, host } = open();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    dialog.compareActuals.set(true);
    fixture.detectChanges();
    const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === 'Items');
    expect(buttons().length).toBe(1);
    expect(buttons()[0].closest('.start-kind')).not.toBeNull();
    expect(host.querySelectorAll('.start-kind-actions > .ghost-button').length).toBe(0);
    expect(host.querySelector('.start-kind legend')!.textContent).toContain('Actual stats are');
    dialog.setInGame(true);
    fixture.detectChanges();
    expect(buttons().length).toBe(1);
    expect(buttons()[0].closest('.start-kind')).not.toBeNull();
    buttons()[0].click();
    fixture.detectChanges();
    expect(host.querySelector('app-stat-booster-dialog')).not.toBeNull();
  });

  it('offers the stat increase menu for base and in-game manually entered stats', () => {
    const { dialog, fixture, host } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const level = host.querySelector<HTMLInputElement>('input[aria-label="Starting level"]')!;
    level.value = '20';
    level.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .filter((button) => button.textContent?.trim() === 'Items');
    expect(buttons().length).toBe(1);
    expect(buttons()[0].closest('.start-kind')).not.toBeNull();
    expect(host.querySelector('.start-kind-actions > .ghost-button')).toBeNull();
    expect(host.querySelector('.start-kind legend')!.textContent).toContain('These stats are');
    dialog.setInGame(true);
    fixture.detectChanges();
    expect(buttons().length).toBe(1);
    buttons()[0].click();
    fixture.detectChanges();
    expect(host.querySelector('app-stat-booster-dialog')).not.toBeNull();
  });

  it('offers and retains theoretical bonuses without actual stats, including level-gated abilities', () => {
    const { dialog, fixture, host, confirmed } = open({ showOptions: true });
    dialog.pickManualUnit(unitId('Mu'));
    dialog.setOption('level', 35);
    fixture.detectChanges();
    expect(dialog.entered()).toBeNull();
    expect(host.querySelector('.start-compare app-stat-increase-menu')).not.toBeNull();
    const abilities = dialog.abilityGroups().flatMap((group) => group.items);
    expect(abilities.map((ability) => ability.name)).toContain("Warrior's Blood+");
    dialog.onAbilitiesConfirmed(["Warrior's Blood"]);
    dialog.onEquipmentConfirmed(['Wooden Sword']);
    dialog.confirm();
    expect(confirmed()!.actual).toBeNull();
    expect(confirmed()!.abilities!.map((ability) => ability.name)).toEqual(["Warrior's Blood"]);
    expect(confirmed()!.equipment).toEqual(['Wooden Sword']);
  });

  it('allows editing the class plan instead of removing an ability', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    dialog.onAbilitiesConfirmed(['Attack Basics']);
    dialog.confirm();
    fixture.detectChanges();
    expect(confirmed()).toBeNull();
    const warning = host.querySelector<HTMLDialogElement>('.warning-dialog')!;
    expect(warning.open).toBeTrue();
    expect(warning.textContent).toContain('Attack Basics');
    expect(warning.textContent).toContain('Gladiator');
    Array.from(warning.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent!.trim() === 'Cancel')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.warning-dialog')).toBeNull();
    expect(confirmed()).toBeNull();
    const plan = fixture.debugElement.query(By.directive(ClassPlanComponent)).componentInstance as ClassPlanComponent;
    const gladiator = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Gladiator')!;
    plan.pickClass(plan.plan()[0].id, gladiator.id);
    fixture.detectChanges();
    dialog.confirm();
    expect(confirmed()!.abilities!.map((ability) => ability.name)).toEqual(['Attack Basics']);
  });

  it('lists every unavailable ability and keeps eligible abilities when continuing', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    const plan = fixture.debugElement.query(By.directive(ClassPlanComponent)).componentInstance as ClassPlanComponent;
    const gladiator = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Gladiator')!;
    plan.pickClass(plan.plan()[0].id, gladiator.id);
    dialog.onAbilitiesConfirmed(['Attack Basics', 'Hunting Basics', 'Divine Insight']);
    fixture.detectChanges();
    dialog.confirm();
    fixture.detectChanges();
    const warningDialog = host.querySelector<HTMLDialogElement>('.warning-dialog')!;
    const warning = warningDialog.textContent!;
    expect(warning).toContain('Hunting Basics');
    expect(warning).toContain('Hunter');
    expect(warning).toContain('Divine Insight');
    expect(warning).not.toContain('Attack Basics');
    Array.from(warningDialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent!.trim() === 'Confirm')!.click();
    expect(confirmed()!.abilities!.map((ability) => ability.name)).toEqual(['Attack Basics']);
  });

  it('dismisses the warning on Escape without closing or confirming the build editor', () => {
    const { dialog, fixture, host, confirmed } = open();
    dialog.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    dialog.onAbilitiesConfirmed(['Attack Basics']);
    let closed = false;
    dialog.closed.subscribe(() => closed = true);
    dialog.confirm();
    fixture.detectChanges();
    const warning = host.querySelector<HTMLDialogElement>('.warning-dialog')!;
    warning.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(host.querySelector('.warning-dialog')).toBeNull();
    expect(confirmed()).toBeNull();
    expect(closed).toBeFalse();
  });
});
