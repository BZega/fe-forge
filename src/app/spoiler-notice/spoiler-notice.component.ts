import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'app-spoiler-notice',
  templateUrl: './spoiler-notice.component.html',
  styleUrl: './spoiler-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpoilerNoticeComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly error = input('');
  readonly dismissed = output<boolean>();
  readonly dontTellAgain = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const previous = document.activeElement;
      this.dialog().nativeElement.showModal();
      destroyRef.onDestroy(() => {
        if (previous instanceof HTMLElement && previous.isConnected) {
          previous.focus({ preventScroll: true });
        }
      });
    });
  }

  dismiss(event?: Event): void {
    event?.preventDefault();
    this.dismissed.emit(this.dontTellAgain());
  }
}
