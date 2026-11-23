import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { MountBondLevel } from '../models/growth.models';
import { SearchableSelectComponent, SelectItem } from '../searchable-select/searchable-select.component';

@Component({
  selector: 'app-mount-dialog',
  imports: [SearchableSelectComponent],
  templateUrl: './mount-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './mount-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MountDialogComponent {
  readonly level = input.required<number>();
  readonly mounts = input.required<readonly SelectItem[]>();
  readonly mountId = input.required<number>();
  readonly bondLevels = input<readonly MountBondLevel[]>([]);
  readonly bondLevel = input<number | null>(null);
  readonly canClear = input(false);

  readonly mountChange = output<number | null>();
  readonly bondLevelChange = output<string>();
  readonly cleared = output<void>();
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
