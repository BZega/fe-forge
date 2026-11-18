import { TestBed } from '@angular/core/testing';
import { GrowthRates, STAT_KEYS, toGrowth } from '../models/growth.models';
import { LevelEntryDialogComponent, LevelEntryRow } from './level-entry-dialog.component';

describe('LevelEntryDialogComponent', () => {
  const rows = (count = 3): LevelEntryRow[] => Array.from({ length: count }, (_, index) => ({
    level: 97 + index,
    className: 'Noble/Commoner',
    growth: { ...toGrowth(null), str: 40 },
    marks: toGrowth(null),
    auto: Object.fromEntries(STAT_KEYS.map((stat) => [stat, false])) as LevelEntryRow['auto'],
    sharedWith: null,
  }));
  const open = (entries = rows()) => {
    const fixture = TestBed.createComponent(LevelEntryDialogComponent);
    fixture.componentRef.setInput('timeline', 'Exam 1');
    fixture.componentRef.setInput('rows', entries);
    fixture.detectChanges();
    const dialog = fixture.componentInstance;
    const host = fixture.nativeElement as HTMLElement;
    const confirmed = jasmine.createSpy('confirmed');
    const closed = jasmine.createSpy('closed');
    dialog.confirmed.subscribe(confirmed);
    dialog.closed.subscribe(closed);
    const count = (value: string) => {
      const input = host.querySelector<HTMLInputElement>('input')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, dialog, host, confirmed, closed, count };
  };

  it('starts with one level ready to mark, without a count-control interaction', () => {
    const entries = rows();
    const { host, confirmed } = open(entries);
    expect(host.querySelectorAll('.stat-toggle').length).toBe(9);
    host.querySelector<HTMLButtonElement>('[aria-label="Str at Lv 97"]')!.click();
    host.querySelector<HTMLButtonElement>('.button--primary')!.click();
    expect(confirmed).toHaveBeenCalledOnceWith([{ ...toGrowth(null), str: 1 }]);
    expect(entries[0].marks.str).toBe(0);
  });

  it('marks several levels and preserves draft marks when resizing the batch', () => {
    const { dialog, count, confirmed } = open();
    count('3');
    dialog.toggle(0, 'str');
    dialog.toggle(2, 'hp');
    count('1');
    expect(dialog.visibleRows().length).toBe(1);
    count('3');
    expect(dialog.range()).toBe('Lv 97–99');
    dialog.confirm();
    expect(confirmed).toHaveBeenCalledOnceWith([
      { ...toGrowth(null), str: 1 }, toGrowth(null), { ...toGrowth(null), hp: 1 },
    ]);
  });

  it('only confirms the visible levels, including an all-zero level', () => {
    const { dialog, count, confirmed } = open();
    count('3');
    dialog.toggle(2, 'str');
    count('1');
    dialog.confirm();
    expect(confirmed).toHaveBeenCalledOnceWith([toGrowth(null)]);
  });

  it('rejects empty, fractional, zero and negative counts with visible feedback', () => {
    const { dialog, host, count, confirmed } = open();
    for (const value of ['', '0', '-1', '1.5']) {
      count(value);
      expect(dialog.count()).withContext(value).toBeNull();
      expect(host.querySelector<HTMLInputElement>('input')!.getAttribute('aria-invalid')).toBe('true');
      expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeTrue();
      expect(host.querySelector('.count-error')!.textContent).toContain('1–3');
      dialog.confirm();
    }
    expect(confirmed).not.toHaveBeenCalled();
    count('3');
    expect(dialog.count()).toBe(3);
  });

  it('caps excessive counts at the remaining levels and updates the input even when already at the maximum', () => {
    const { dialog, host, count, confirmed } = open();
    dialog.toggle(0, 'str');
    for (const value of ['4', '999', '3.5']) {
      count(value);
      expect(dialog.count()).toBe(3);
      expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('3');
      expect(host.querySelector<HTMLInputElement>('input')!.getAttribute('aria-invalid')).toBe('false');
      expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeFalse();
      expect(dialog.range()).toBe('Lv 97–99');
    }
    dialog.confirm();
    expect(confirmed).toHaveBeenCalledOnceWith([
      { ...toGrowth(null), str: 1 }, toGrowth(null), toGrowth(null),
    ]);
  });

  it('caps the count at one when only the final level remains', () => {
    const { dialog, host, count } = open([{ ...rows(1)[0], level: 99 }]);
    count('99');
    expect(dialog.count()).toBe(1);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('1');
    expect(dialog.range()).toBe('Lv 99');
  });

  it('closes via Cancel, backdrop, close button or Escape without confirming a draft', () => {
    const { dialog, host, closed, confirmed } = open();
    dialog.toggle(0, 'str');
    host.querySelector<HTMLButtonElement>('.dialog-footer .button')!.click();
    host.querySelector<HTMLElement>('.backdrop')!.click();
    host.querySelector<HTMLButtonElement>('.dialog-close')!.click();
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalledTimes(4);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('shows shared-roll marks and inferred stats without saving inferred stats as manual observations', () => {
    const entries = rows(1);
    entries[0].marks.str = 1;
    entries[0].auto.hp = true;
    entries[0].sharedWith = 'Seed Lv 97';
    const { host, dialog, confirmed } = open(entries);
    expect(host.querySelector('[aria-label="HP at Lv 97"]')!.classList).toContain('stat-toggle--auto');
    expect(host.querySelector('[aria-label="Str at Lv 97"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('Shared roll: Seed Lv 97');
    dialog.confirm();
    expect(confirmed).toHaveBeenCalledOnceWith([{ ...toGrowth(null), str: 1 }]);
  });

  it('keeps focus within the modal using Tab and Shift+Tab', () => {
    const { host, dialog } = open();
    const close = host.querySelector<HTMLButtonElement>('.dialog-close')!;
    const confirm = host.querySelector<HTMLButtonElement>('.button--primary')!;
    close.focus();
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(confirm);
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.activeElement).toBe(close);
  });

  it('fits a complete stat row at mobile width and keeps confirmation outside the scrolling list', () => {
    const { host } = open(rows(98));
    const modal = host.querySelector<HTMLElement>('.dialog')!;
    modal.style.width = '300px';
    modal.style.boxSizing = 'border-box';
    expect(modal.scrollWidth).toBeLessThanOrEqual(modal.clientWidth);
    expect(host.querySelector('.level-list .dialog-footer')).toBeNull();
  });
});
