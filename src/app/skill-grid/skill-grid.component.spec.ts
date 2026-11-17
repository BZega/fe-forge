import { TestBed } from '@angular/core/testing';
import { SkillGridComponent } from './skill-grid.component';

describe('SkillGridComponent', () => {
  it('uses only a gold border for usable skills while preserving preference icons', () => {
    const fixture = TestBed.createComponent(SkillGridComponent);
    fixture.componentRef.setInput('items', [
      { key: 'sword', label: 'Sword', value: 'E', usable: true, preference: 'good' },
      { key: 'axe', label: 'Axe', value: 'E', usable: false, preference: 'bad' },
    ]);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.style.setProperty('--surface', '#11262a');
    const rows = host.querySelectorAll<HTMLElement>('.skill-rank');
    expect(getComputedStyle(rows[0]).backgroundColor).toBe('rgb(17, 38, 42)');
    expect(getComputedStyle(rows[1]).backgroundColor).toBe('rgb(17, 38, 42)');
    expect(getComputedStyle(rows[0]).borderTopColor).toBe('rgb(240, 192, 74)');
    expect(fixture.componentInstance.fallback(fixture.componentInstance.items()[0])).toContain('gold/sword.svg');
    expect(fixture.componentInstance.fallback(fixture.componentInstance.items()[1])).toContain('silver/axe.svg');
  });
});
