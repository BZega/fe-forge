import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchableSelectComponent, SelectItem } from './searchable-select.component';

@Component({
  imports: [SearchableSelectComponent],
  template: `<app-searchable-select label="Unit" [keyboard]="false" [items]="items" />`,
})
class HostComponent {
  readonly items: SelectItem[] = [
    { id: 1, name: 'Alexandra' },
    { id: 2, name: 'Alecto' },
    { id: 3, name: 'Aleph' },
    { id: 4, name: 'Bertrand' },
  ];
}

describe('SearchableSelectComponent without the keyboard', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  const options = () =>
    Array.from(fixture.nativeElement.querySelectorAll('.option:not(.option--clear)') as NodeListOf<HTMLElement>)
      .map((option) => option.textContent!.trim());
  const empty = () => (fixture.nativeElement.querySelector('.panel-empty') as HTMLElement | null)?.textContent!.trim();
  const tapInput = () => {
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    input.click();
    fixture.detectChanges();
  };
  const type = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  it('opens the full list on the first tap without the keyboard', () => {
    tapInput();

    expect(input.getAttribute('inputmode')).toBe('none');
    expect(options()).toEqual(['Alexandra', 'Alecto', 'Aleph', 'Bertrand']);
  });

  it('switches to typing when the text box is tapped again, waiting for 2 letters and showing at most 2 results', () => {
    tapInput();
    tapInput();

    expect(input.hasAttribute('inputmode')).toBeFalse();
    expect(options()).toEqual([]);
    expect(empty()).toBe('Type at least 2 letters');

    type('a');
    expect(options()).toEqual([]);

    type('al');
    expect(options()).toEqual(['Alexandra', 'Alecto']);
  });

  it('goes back to tap-only after a pick', () => {
    tapInput();
    tapInput();
    type('ber');

    (fixture.nativeElement.querySelector('.option') as HTMLElement).click();
    fixture.detectChanges();

    expect(input.getAttribute('inputmode')).toBe('none');
  });

  it('reports keyboard-open state until selection or dismissal, not input blur', () => {
    const states: boolean[] = [];
    fixture.nativeElement.addEventListener('dropdownkeyboardchange', (event: CustomEvent<boolean>) => states.push(event.detail));
    tapInput();
    expect(states.at(-1)).toBeFalse();
    tapInput();
    expect(states.at(-1)).toBeTrue();
    type('al');
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(states.at(-1)).toBeTrue();
    (fixture.nativeElement.querySelector('.option') as HTMLElement).click();
    fixture.detectChanges();
    expect(states.at(-1)).toBeFalse();
    tapInput();
    tapInput();
    expect(states.at(-1)).toBeTrue();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(states.at(-1)).toBeFalse();
  });
});
