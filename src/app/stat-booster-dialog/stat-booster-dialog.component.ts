import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, input, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core';
import { BoosterCounts, BoosterEntry, BoosterKey, STAT_BOOSTERS, sumBoosters } from '../models/stat-boosters';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';

@Component({
  selector: 'app-stat-booster-dialog',
  imports: [HelpDialogComponent],
  templateUrl: './stat-booster-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './stat-booster-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatBoosterDialogComponent implements OnInit, OnDestroy {
  readonly entries = input.required<readonly BoosterEntry[]>();
  readonly inherited = input<BoosterCounts>({});
  readonly context = input('');
  readonly error = input<string | null>(null);
  readonly confirmed = output<BoosterEntry[]>();
  readonly closed = output<void>();
  readonly boosters = STAT_BOOSTERS;
  readonly draft = signal<BoosterEntry[]>([]);
  readonly selected = signal(0);
  readonly current = computed(() => this.draft().at(this.selected()));
  readonly currentCounts = computed<BoosterCounts>(() => this.current()?.counts ?? {});
  readonly minLevel = computed(() => this.draft()[0]?.level ?? 1);
  readonly maxLevel = computed(() => this.draft().at(-1)?.level ?? this.minLevel());
  readonly total = computed(() => sumBoosters(this.inherited(), ...this.draft().map((entry) => entry.counts)));
  readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  readonly help = viewChild(HelpDialogComponent);
  readonly helpText = computed(() => [
    this.context(),
    'Permanent base-stat gains, capped at 120 HP / 99 other stats. Uses are limited across the whole timeline, not per level. Movement uses are tracked only.',
  ]);
  private readonly opener = document.activeElement;

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('select, input')?.focus());
  }
  ngOnInit(): void {
    this.draft.set(this.entries().map((entry) => ({ ...entry, counts: { ...entry.counts } })));
  }
  ngOnDestroy(): void {
    if (this.opener instanceof HTMLElement && this.opener.isConnected) this.opener.focus();
  }
  maximum(key: BoosterKey, max: number): number {
    return Math.max(0, max - (this.total()[key] ?? 0) + (this.current()?.counts[key] ?? 0));
  }
  setLevel(field: HTMLInputElement): void {
    const value = Number(field.value);
    if (field.value.trim() !== '' && Number.isFinite(value)) {
      const level = Math.min(this.maxLevel(), Math.max(this.minLevel(), Math.round(value)));
      const index = this.draft().findIndex((entry) => entry.level !== undefined && entry.level >= level);
      this.selected.set(Math.max(0, index));
    }
    field.value = String(this.current()?.level ?? this.minLevel());
  }
  setCount(field: HTMLInputElement, key: BoosterKey, max: number): void {
    const value = Number(field.value);
    const count = Number.isFinite(value) ? Math.min(this.maximum(key, max), Math.max(0, Math.round(value))) : 0;
    this.draft.update((entries) => entries.map((entry, index) => index === this.selected()
      ? { ...entry, counts: { ...entry.counts, [key]: count } } : entry));
    field.value = String(count);
  }
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.help()?.open() || (event.target instanceof Element && event.target.closest('.help-overlay'))) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.closed.emit();
    } else if (event.key === 'Tab') {
      const controls = Array.from(this.dialog().nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), input, select'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  }
}
