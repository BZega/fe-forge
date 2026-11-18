import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, input, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core';
import { GrowthRates, STAT_KEYS, STAT_LABELS, StatKey } from '../models/growth.models';

export interface LevelEntryRow {
  level: number;
  className: string;
  growth: GrowthRates | null;
  marks: GrowthRates;
  auto: Record<StatKey, boolean>;
  sharedWith: string | null;
}

@Component({
  selector: 'app-level-entry-dialog',
  templateUrl: './level-entry-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './level-entry-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelEntryDialogComponent implements OnInit, OnDestroy {
  readonly timeline = input.required<string>();
  readonly rows = input.required<readonly LevelEntryRow[]>();
  readonly error = input<string | null>(null);
  readonly confirmed = output<GrowthRates[]>();
  readonly closed = output<void>();
  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly countText = signal('1');
  readonly marks = signal<readonly GrowthRates[]>([]);
  readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener = document.activeElement;

  readonly count = computed(() => {
    const value = Number(this.countText());
    return Number.isInteger(value) && value >= 1 && value <= this.rows().length ? value : null;
  });
  readonly visibleRows = computed(() => this.rows().slice(0, this.count() ?? 0));
  readonly range = computed(() => {
    const rows = this.visibleRows();
    return rows.length === 1 ? `Lv ${rows[0].level}` : rows.length ? `Lv ${rows[0].level}–${rows.at(-1)!.level}` : '';
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLButtonElement>('.stat-toggle')?.focus());
  }

  ngOnInit(): void {
    this.marks.set(this.rows().map((row) => ({ ...row.marks })));
  }

  ngOnDestroy(): void {
    if (this.opener instanceof HTMLElement && this.opener.isConnected) this.opener.focus();
  }

  updateCount(input: HTMLInputElement): void {
    const value = Number(input.value);
    if (Number.isFinite(value) && value > this.rows().length) {
      input.value = String(this.rows().length);
    }
    this.countText.set(input.value);
  }

  toggle(index: number, stat: StatKey): void {
    this.marks.update((rows) => rows.map((marks, rowIndex) =>
      rowIndex === index ? { ...marks, [stat]: marks[stat] > 0 ? 0 : 1 } : marks,
    ));
  }

  confirm(): void {
    const count = this.count();
    if (count !== null) this.confirmed.emit(this.marks().slice(0, count).map((marks) => ({ ...marks })));
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
    } else if (event.key === 'Tab') {
      const controls = Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), input'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
}
