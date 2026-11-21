import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

export interface MissingAbility {
  name: string;
  teachers: readonly string[];
}

@Component({
  selector: 'app-ability-warning-dialog',
  template: `
    <dialog #dialog class="warning-dialog" aria-labelledby="ability-warning-title"
      aria-describedby="ability-warning-description"
      (cancel)="cancel($event)" (keydown.escape)="$event.stopPropagation()">
      <header class="dialog-header">
        <h2 id="ability-warning-title">Some abilities will be removed</h2>
      </header>
      <p id="ability-warning-description">Their teaching classes are not in the class plan:</p>
      <ul>
        @for (ability of abilities(); track ability.name) {
          <li>{{ ability.name }}@if (ability.teachers.length) { — {{ ability.teachers.join(' or ') }}}</li>
        }
      </ul>
      <p>Add a teaching class to keep its ability, or confirm to continue without it.</p>
      <footer class="dialog-footer">
        <button type="button" class="button" autofocus (click)="dismiss()">Cancel</button>
        <button type="button" class="button button--primary" (click)="accept()">Confirm</button>
      </footer>
    </dialog>
  `,
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './ability-warning-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbilityWarningDialogComponent implements AfterViewInit {
  readonly abilities = input.required<readonly MissingAbility[]>();
  readonly confirmed = output<void>();
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  dismiss(): void {
    this.dialog().nativeElement.close();
    this.closed.emit();
  }

  accept(): void {
    this.dialog().nativeElement.close();
    this.confirmed.emit();
  }
}
