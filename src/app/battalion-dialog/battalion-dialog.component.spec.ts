import { TestBed } from '@angular/core/testing';
import { Battalion, toGrowth } from '../models/growth.models';
import { BattalionDialogComponent } from './battalion-dialog.component';

describe('BattalionDialogComponent', () => {
  const battalions: Battalion[] = [
    { ...toGrowth({ str: 2 }), id: 1, name: 'Zeta', type: 'Physical', rank: 'D', total: 2, skillName: '', skillDescription: '' },
    { ...toGrowth({ mag: 3 }), id: 2, name: 'Alpha', type: 'Magic', rank: 'E', total: 3, skillName: '', skillDescription: '' },
    { ...toGrowth({ def: 1 }), id: 3, name: 'Beta', type: 'Defense', rank: 'E', total: 1, skillName: '', skillDescription: '' },
  ];

  it('sorts by rank, filters by tab and search, and shows equipment-style disclosures', () => {
    const fixture = TestBed.createComponent(BattalionDialogComponent);
    fixture.componentRef.setInput('battalions', battalions);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const names = () => Array.from(host.querySelectorAll('.picker-item-name')).map((element) => element.textContent!.trim());
    expect(names()).toEqual(['Alpha · Magic', 'Beta · Defense', 'Zeta · Physical']);
    const details = host.querySelector<HTMLDetailsElement>('.picker-item-details')!;
    expect(details.open).toBeFalse();
    expect(details.querySelector('.picker-item-chevron')).not.toBeNull();
    details.open = true;
    expect(details.textContent).toContain('Mag +3');
    const magic = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent!.trim() === 'Magic')!;
    magic.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Alpha · Magic']);
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'zeta';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(names()).toEqual([]);
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent!.trim() === 'ALL')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['Zeta · Physical']);
  });

  it('replaces or clears the assigned battalion only on confirmation', () => {
    const fixture = TestBed.createComponent(BattalionDialogComponent);
    fixture.componentRef.setInput('battalions', battalions);
    fixture.componentRef.setInput('selected', battalions[0]);
    let result: Battalion | null | undefined;
    fixture.componentInstance.confirmed.subscribe((value) => result = value);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    host.querySelector<HTMLInputElement>('input[aria-label="Assign Alpha · Magic"]')!.click();
    fixture.detectChanges();
    expect(result).toBeUndefined();
    host.querySelector<HTMLButtonElement>('.button--primary')!.click();
    expect(result).toEqual(battalions[1]);
    host.querySelector<HTMLInputElement>('input[aria-label="Assign Alpha · Magic"]')!.click();
    host.querySelector<HTMLButtonElement>('.button--primary')!.click();
    expect(result).toBeNull();
  });
});
