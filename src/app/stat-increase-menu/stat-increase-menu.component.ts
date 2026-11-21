import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output } from '@angular/core';

@Component({
  selector: 'app-stat-increase-menu',
  template: `
    <details #menu class="stat-menu" (keydown.escape)="onEscape($event, menu)">
      <summary class="stat-menu-trigger">
        <span>Stat Increase</span>
        <span class="stat-menu-chevron" aria-hidden="true"></span>
      </summary>
      <div class="stat-menu-options">
        <button type="button" (click)="menu.open = false; items.emit()">Items</button>
        <button type="button" (click)="menu.open = false; inventory.emit()">Inventory</button>
        <button type="button" [disabled]="!abilitiesEnabled()" [title]="abilitiesEnabled() ? '' : 'No stat-boosting abilities available'"
          (click)="menu.open = false; abilities.emit()">Abilities</button>
        <button type="button" (click)="menu.open = false; assign.emit()">Assign</button>
      </div>
    </details>
  `,
  styleUrl: './stat-increase-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatIncreaseMenuComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly abilitiesEnabled = input(true);
  readonly items = output<void>();
  readonly inventory = output<void>();
  readonly abilities = output<void>();
  readonly assign = output<void>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.host.nativeElement.contains(event.target)) {
      const menu = this.host.nativeElement.querySelector('details');
      if (menu) menu.open = false;
    }
  }

  onEscape(event: Event, menu: HTMLDetailsElement): void {
    if (!menu.open) return;
    event.preventDefault();
    event.stopPropagation();
    menu.open = false;
    menu.querySelector<HTMLElement>('summary')?.focus();
  }
}
