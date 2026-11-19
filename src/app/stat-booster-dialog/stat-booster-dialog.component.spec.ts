import { TestBed } from '@angular/core/testing';
import { StatBoosterDialogComponent } from './stat-booster-dialog.component';

describe('StatBoosterDialogComponent', () => {
  const open = () => {
    const fixture = TestBed.createComponent(StatBoosterDialogComponent);
    fixture.componentRef.setInput('entries', [
      { key: null, label: 'Lv 1', counts: {} },
      { key: 12, label: 'Lv 12', counts: {} },
    ]);
    fixture.componentRef.setInput('inherited', { str: 1 });
    fixture.componentRef.setInput('context', 'Earlier uses are inherited by branches.');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const field = (name: string) => host.querySelector<HTMLInputElement>(`[aria-label="${name} uses"]`)!;
    const type = (name: string, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, host, dialog: fixture.componentInstance, field, type };
  };

  it('shares each item allowance across levels, preserves drafts, and caps excessive input', () => {
    const { dialog, fixture, field, type } = open();
    type('Energy Drop', '2');
    expect(dialog.total().str).toBe(3);
    dialog.selected.set(1);
    fixture.detectChanges();
    type('Energy Drop', '99');
    expect(field('Energy Drop').value).toBe('1');
    expect(dialog.total().str).toBe(4);
    dialog.selected.set(0);
    fixture.detectChanges();
    expect(field('Energy Drop').value).toBe('2');
    type('Energy Drop', '-5');
    expect(field('Energy Drop').value).toBe('0');
    expect(dialog.total().str).toBe(2);
  });

  it('tracks movement independently and confirms all level drafts without mutating its input', () => {
    const { dialog, type, host } = open();
    const confirmed = jasmine.createSpy();
    dialog.confirmed.subscribe(confirmed);
    type('Shoes of the Wind', '9');
    expect(dialog.total().mov).toBe(3);
    host.querySelector<HTMLButtonElement>('.button--primary')!.click();
    expect(confirmed).toHaveBeenCalledOnceWith([
      { key: null, label: 'Lv 1', counts: { mov: 3 } }, { key: 12, label: 'Lv 12', counts: {} },
    ]);
    expect(dialog.entries()[0].counts).toEqual({});
  });

  it('keeps helper text inside the helper modal and does not close boosters while help is open', () => {
    const { dialog, host, fixture } = open();
    expect(host.textContent).not.toContain('Permanent base-stat gains');
    host.querySelector<HTMLButtonElement>('[aria-label="Help: Stat boosters"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.help-overlay')!.textContent).toContain('Permanent base-stat gains');
    expect(host.querySelector('.help-overlay')!.textContent).toContain('Earlier uses are inherited');
    const close = jasmine.createSpy();
    dialog.closed.subscribe(close);
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).not.toHaveBeenCalled();
    dialog.help()!.close();
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('discards changes on cancellation', () => {
    const { dialog, host, type } = open();
    const confirmed = jasmine.createSpy(), closed = jasmine.createSpy();
    dialog.confirmed.subscribe(confirmed);
    dialog.closed.subscribe(closed);
    type('Energy Drop', '2');
    host.querySelector<HTMLButtonElement>('.dialog-footer .button')!.click();
    expect(confirmed).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(dialog.entries()[0].counts).toEqual({});
  });

  it('selects mapped levels with a numeric input, caps the range, and preserves each level draft', () => {
    const { fixture, host, dialog, type } = open();
    fixture.componentRef.setInput('entries', [
      { key: null, level: 1, label: 'Lv 1', counts: {} },
      { key: 12, level: 2, label: 'Lv 2', counts: {} },
    ]);
    dialog.ngOnInit();
    fixture.detectChanges();
    const field = host.querySelector<HTMLInputElement>('[aria-label="Booster level"]')!;
    const level = (value: string) => {
      field.value = value;
      field.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    expect(field.type).toBe('number');
    expect(field.min).toBe('1');
    expect(field.max).toBe('2');
    expect(host.querySelector('select')).toBeNull();
    type('Energy Drop', '2');
    level('999');
    expect(field.value).toBe('2');
    expect(dialog.selected()).toBe(1);
    type('Energy Drop', '1');
    level('-1');
    expect(field.value).toBe('1');
    expect(dialog.currentCounts().str).toBe(2);
    level('');
    expect(field.value).toBe('1');
    level('1.8');
    expect(field.value).toBe('2');
    expect(dialog.currentCounts().str).toBe(1);
  });
});
