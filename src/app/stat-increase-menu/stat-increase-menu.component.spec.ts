import { TestBed } from '@angular/core/testing';
import { StatIncreaseMenuComponent } from './stat-increase-menu.component';

describe('StatIncreaseMenuComponent', () => {
  it('opens the requested selector and disables unavailable abilities', () => {
    const fixture = TestBed.createComponent(StatIncreaseMenuComponent);
    fixture.componentRef.setInput('abilitiesEnabled', false);
    let items = 0;
    fixture.componentInstance.items.subscribe(() => items++);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.map((button) => button.textContent!.trim())).toEqual(['Items', 'Inventory', 'Abilities', 'Assign']);
    expect(buttons[2].disabled).toBeTrue();
    const menu = host.querySelector<HTMLDetailsElement>('details')!;
    menu.open = true;
    buttons[0].click();
    expect(items).toBe(1);
    expect(menu.open).toBeFalse();
  });

  it('dismisses on outside click and Escape, restoring focus after Escape', () => {
    const fixture = TestBed.createComponent(StatIncreaseMenuComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const menu = host.querySelector<HTMLDetailsElement>('details')!;
    const summary = host.querySelector<HTMLElement>('summary')!;
    menu.open = true;
    document.body.click();
    expect(menu.open).toBeFalse();
    menu.open = true;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
    expect(menu.open).toBeFalse();
    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(summary);
  });
});
