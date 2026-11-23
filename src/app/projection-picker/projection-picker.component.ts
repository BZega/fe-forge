import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { inGameBonus } from '../models/bonuses';
import { STAT_KEYS, toGrowth } from '../models/growth.models';
import { RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { projectionActuals, ProjectionActual, ProjectionStart, ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';

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

    const step = stepAtLevel(start.steps, start.level);
    const bonuses = start.inGameStats
      ? inGameBonus(start.name, start.level, step?.unitClass ?? null, step?.mount ?? null, step?.bondLevel ?? null, {
          abilities: start.abilities ?? [],
          weapon: start.weapon ?? null,
          battalion: start.battalion ?? null,
        })
      : toGrowth(null);

    return [
      {
        chapter: 0,
        level: start.level,
        className: 'Noble/Commoner',
        skillRanks: {},
        stats: Object.fromEntries(STAT_KEYS.map((stat) => [stat, start.stats[stat] - bonuses[stat]])) as RecruitmentChapter['stats'],
        inventory: [],
        equippedAbilities: [],
      },
    ];
  });

  actualsFor(start: ProjectionStart): ProjectionActual[] {
    return projectionActuals(start);
  }

  close(): void {
    this.closed.emit();
  }
}
