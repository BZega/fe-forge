import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import unitClassData from '../data/unit-classes.json';
import { CLASS_LEVEL_CONFIGS, CLASS_RANK_ORDER, growthTotal, STAT_KEYS, sumGrowth, toGrowth, UnitClass } from '../models/growth.models';
import { SpoilerService } from '../services/spoiler.service';
import { ClassPageComponent } from './class-page.component';

const ordered = CLASS_RANK_ORDER.flatMap((rank) =>
  (unitClassData as UnitClass[]).filter((unitClass) => unitClass.rank === rank),
);

describe('ClassPageComponent class switcher keyboard', () => {
  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const open = (id: number) => {
    TestBed.configureTestingModule({
      imports: [ClassPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: String(id) })) } },
      ],
    });
    TestBed.inject(SpoilerService).setAllHidden(false);
    const fixture = TestBed.createComponent(ClassPageComponent);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const host = fixture.nativeElement as HTMLElement;
    const press = (target: Element, key: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    const toggle = () => host.querySelector<HTMLButtonElement>('.switcher-toggle')!;
    const filter = () => host.querySelector<HTMLInputElement>('.switcher-filter')!;
    const active = () => host.querySelector('.switcher-option--active')?.textContent!.trim();

    return { fixture, component: fixture.componentInstance, host, navigate, press, toggle, filter, active };
  };

  const second = ordered[1];

  for (const name of ['Charioteer', 'Elephant Rider']) {
    it(`shows ${name} growth rates for each level gate`, () => {
      const unitClass = (unitClassData as UnitClass[]).find((candidate) => candidate.name === name)!;
      const config = CLASS_LEVEL_CONFIGS[name];
      const page = open(unitClass.id);
      const select = page.host.querySelector<HTMLSelectElement>('select[aria-label="Class growth level"]')!;

      expect(select.value).toBe(String(config.defaultLevel));
      expect(Array.from(select.options).map((option) => Number(option.value))).toEqual([...config.levels]);

      for (const level of config.levels) {
        select.value = String(level);
        select.dispatchEvent(new Event('change'));
        page.fixture.detectChanges();
        const growth = sumGrowth(toGrowth(unitClass), toGrowth(config.bonuses[level]));
        const values = Array.from(page.host.querySelectorAll('.growth-body .stat-row-value')).map((element) => element.textContent!.trim());

        expect(values).toEqual(STAT_KEYS.map((stat) => `${page.component.signed(growth[stat])}%`));
        expect(page.host.querySelector('.growth-feature-value')!.textContent!.trim()).toBe(`${page.component.signed(growthTotal(growth))}%`);
      }
    });
  }

  it('does not show a growth level selector for other classes', () => {
    const page = open(second.id);
    expect(page.host.querySelector('select[aria-label="Class growth level"]')).toBeNull();
  });

  it('shows class bonuses and floors using shared stat rows', () => {
    const unitClass = (unitClassData as UnitClass[]).find((candidate) => candidate.name === 'Ornius Rider')!;
    const page = open(unitClass.id);
    const value = (label: string) => Array.from(page.host.querySelectorAll('#stat-panel-' + page.component.statTab() + ' .stat-row'))
      .find((row) => row.querySelector('.stat-row-label')!.textContent!.trim() === label)!
      .querySelector('.stat-row-value')!.textContent!.trim();

    expect(value('Spd')).toBe('+3');
    const speed = Array.from(page.host.querySelectorAll<HTMLElement>('#stat-panel-bonus .stat-row'))
      .find((row) => row.querySelector('.stat-row-label')!.textContent!.trim() === 'Spd')!;
    expect(speed.title).toBe('Base Value 0; Class +3; Modifier +0');
    expect(speed.querySelector('.stat-bonus')).not.toBeNull();
    expect(getComputedStyle(speed.querySelector('.stat-bonus')!).color).toBe('rgb(240, 192, 74)');
    page.host.querySelector<HTMLButtonElement>('#stat-tab-base')!.click();
    page.fixture.detectChanges();
    expect(value('Spd')).toBe('8');
    expect(page.host.querySelector('#stat-panel-base .stat-bonus')).toBeNull();
    expect(value('HP')).toBe(String(unitClass.classFloorStats.hp));
  });

  it('places class stats in two columns with five rows on the left', () => {
    const page = open(second.id);
    document.body.appendChild(page.host);

    const check = (expected: string[]) => {
      const rows = Array.from(page.host.querySelectorAll<HTMLElement>('[role="tabpanel"] .stat-row'));
      expect(rows.map((row) => row.querySelector('.stat-row-label')!.textContent!.trim())).toEqual(expected);
      const positions = rows.map((row) => row.getBoundingClientRect());
      expect(positions.slice(0, 5).every((rect) => rect.left === positions[0].left)).toBeTrue();
      expect(positions.slice(5).every((rect) => rect.left > positions[0].left)).toBeTrue();
      expect(positions[5].top).toBe(positions[0].top);
    };

    check(['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha', 'Mov']);
    page.host.querySelector<HTMLButtonElement>('#stat-tab-base')!.click();
    page.fixture.detectChanges();
    check(['HP', 'Str', 'Mag', 'Spd', 'Dex', 'Def', 'Res', 'Lck', 'Cha']);
    page.host.remove();
  });

  it('shows and dismisses a class skill hint', () => {
    const unitClass = (unitClassData as UnitClass[]).find((candidate) => candidate.name === 'Charioteer')!;
    const page = open(unitClass.id);
    const skill = page.host.querySelector<HTMLButtonElement>('app-skill-grid button')!;

    expect(skill.getAttribute('aria-label')).toContain('EXP bonus');
    skill.click();
    page.fixture.detectChanges();
    expect(skill.querySelector('.skill-tip')?.textContent!.trim()).toBe('Bow');
    skill.click();
    page.fixture.detectChanges();
    expect(skill.querySelector('.skill-tip')).toBeNull();
  });

  it('toggles the Noble/Commoner header between Noble, Commoner and God', () => {
    const origin = (unitClassData as UnitClass[]).find((unitClass) => unitClass.name === 'Noble/Commoner')!;
    const page = open(origin.id);
    const tabs = () => Array.from(page.host.querySelectorAll<HTMLButtonElement>('.hero-variants [role="tab"]'));
    const text = () => Array.from(page.host.querySelectorAll('.hero-description')).map((line) => line.textContent!.trim());

    expect(tabs().map((tab) => tab.textContent!.trim())).toEqual(['Noble', 'Commoner', 'God']);
    expect(text()).toEqual([origin.description.split('/')[0]]);
    expect(page.host.querySelector('.portrait-glyph')!.textContent!.trim()).toBe('NO');

    tabs()[1].click();
    page.fixture.detectChanges();
    expect(text()).toEqual([origin.description.split('/')[1]]);

    tabs()[2].click();
    page.fixture.detectChanges();
    expect(text()).toEqual(['WIP']);
    expect(page.host.querySelector('.portrait-glyph')!.textContent!.trim()).toBe('GO');
  });

  it('has no origin toggle on other classes', () => {
    const page = open(second.id);

    expect(page.host.querySelector('.hero-variants')).toBeNull();
  });

  it('starts on the current class and moves the highlight with the up and down arrows', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    expect(page.active()).toBe(second.name);

    page.press(page.filter(), 'ArrowDown');
    expect(page.active()).toBe(ordered[2].name);

    page.press(page.filter(), 'ArrowUp');
    page.press(page.filter(), 'ArrowUp');
    expect(page.active()).toBe(ordered[0].name);
  });

  it('opens the highlighted class with Enter, closes the list and returns focus to the class name', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    page.press(page.filter(), 'ArrowDown');
    page.press(page.filter(), 'Enter');

    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);
    expect(page.component.switcherOpen()).toBeFalse();
    expect(document.activeElement).toBe(page.toggle());
  });

  it('highlights the first match while filtering', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    page.filter().value = ordered[3].name;
    page.filter().dispatchEvent(new Event('input'));
    page.fixture.detectChanges();

    expect(page.active()).toBe(ordered[3].name);
  });

  it('keeps stepping through classes with up and down on the class name once the list is closed', () => {
    const page = open(second.id);

    page.press(page.toggle(), 'ArrowDown');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);

    page.press(page.toggle(), 'ArrowUp');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[0].id]);
  });

  it('wraps from the first class back to the last', () => {
    const page = open(ordered[0].id);

    page.press(page.toggle(), 'ArrowUp');

    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered.at(-1)!.id]);
  });

  it('links to the previous and next class at the bottom of the page, on opposite sides', () => {
    const page = open(second.id);
    const links = Array.from(page.host.querySelectorAll<HTMLElement>('.class-steps a'));

    expect(links.map((link) => link.textContent!.trim())).toEqual([`‹ ${ordered[0].name}`, `${ordered[2].name} ›`]);
    expect(page.host.querySelector('.profile')!.compareDocumentPosition(links[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(links[1].getBoundingClientRect().left).toBeGreaterThan(links[0].getBoundingClientRect().right);
  });

  it('shows only the next link on the first class and only the previous link on the last', () => {
    expect(Array.from(open(ordered[0].id).host.querySelectorAll('.class-steps a')).map((link) => link.textContent!.trim()))
      .toEqual([`${ordered[1].name} ›`]);
  });

  it('moves to the previous and next class with the left and right arrow keys', () => {
    const page = open(second.id);

    page.press(document.body, 'ArrowRight');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);

    page.press(document.body, 'ArrowLeft');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[0].id]);
  });

  it('leaves left and right alone while typing, on the stat tabs, or with the list open', () => {
    const page = open(second.id);
    const input = document.createElement('input');
    page.host.appendChild(input);

    page.press(input, 'ArrowRight');
    page.press(page.host.querySelector('[role="tab"]')!, 'ArrowRight');
    page.toggle().click();
    page.fixture.detectChanges();
    page.press(document.body, 'ArrowRight');

    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('keeps the tier label and value as separate pieces with no stray spacing', () => {
    const page = open(second.id);
    const badge = page.host.querySelector('.badge--rank')!;

    expect(Array.from(badge.children).map((child) => child.textContent)).toEqual(['Tier', second.rank]);
  });
});
