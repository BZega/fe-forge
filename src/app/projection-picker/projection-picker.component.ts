import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { STAT_KEYS } from '../models/growth.models';
import { RecruitmentChapter } from '../models/recruitment.models';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { ProjectionStart, ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';

@Component({
  selector: 'app-projection-picker',
  imports: [ProjectionDialogComponent, ProjectionStartDialogComponent],
  templateUrl: './projection-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionPickerComponent {
  readonly closed = output<void>();

  readonly start = signal<ProjectionStart | null>(null);
  readonly projecting = signal(false);

  readonly chapters = computed<readonly RecruitmentChapter[]>(() => {
    const start = this.start();

    if (!start || start.source === 'chapter') {
      return start?.chapters ?? [];
    }

    return [
      {
        chapter: 0,
        level: start.level,
        className: 'Noble/Commoner',
        skillRanks: {},
        stats: Object.fromEntries(STAT_KEYS.map((stat) => [stat, start.stats[stat]])) as RecruitmentChapter['stats'],
        inventory: [],
        equippedAbilities: [],
      },
    ];
  });

  close(): void {
    this.closed.emit();
  }
}
