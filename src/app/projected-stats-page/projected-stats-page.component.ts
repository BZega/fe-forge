import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { BuildResult, ProjectionBuildComponent } from '../projection-build/projection-build.component';
import { ProjectionComparisonDialogComponent } from '../projection-comparison-dialog/projection-comparison-dialog.component';
import { ProjectionStart, ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';
import { BoosterCounts } from '../models/stat-boosters';
import { ProjectionSave, ProjectionSaveStorageService } from '../services/projection-save-storage.service';

interface Build {
  id: number;
  transactionId: string;
  start: ProjectionStart;
  savedId: string | null;
  name: string;
}

interface StartDialogState {
  editId: number | null;
  addActuals: boolean;
}

@Component({
  selector: 'app-projected-stats-page',
  imports: [DatePipe, HelpDialogComponent, ProjectionBuildComponent, ProjectionComparisonDialogComponent, ProjectionStartDialogComponent],
  templateUrl: './projected-stats-page.component.html',
  styleUrl: './projected-stats-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectedStatsPageComponent {
  private readonly storage = inject(ProjectionSaveStorageService);
  readonly saves = this.storage.saves;
  readonly saveStatus = signal('');
  readonly helpText = [
    'Use + Build to add a character: choose Manual (their Lv 1 base stats, or stats you enter at any level) or Recruitment (the stats they join with). In the same window, plan their classes (each reclass has its own level, and classes unlock by rank) and set the level and options for that build. Edit reopens it.',
    'Each stat shows its average, spread (standard deviation), middle 50% of outcomes, and growth rate at the build’s level, with a histogram of every outcome. Add the stats you actually got in the build, as base or in-game stats, to see how lucky they were at that level.',
    'The chances are calculated exactly from the growth rates, level by level, not simulated. Reclassing into a class for the first time raises stats below its class floors.',
    'With Guaranteed minimum on, a level up that raises too few stats (fewer than 2 in Part I, 1 after) gets extra ones. Which stats the game picks isn’t known, so they’re assumed to be spread evenly over the stats that could have risen; turn it off to see plain independent rolls.',
    'Rolls are fixed per save (see the Growth Mapper), but until you know them each is treated as an even 0–99 roll.',
    'Compare Builds (with two or more builds) shows two of them side by side, with the chance each ends higher.',
    'Equipment equips one weapon and one each of Shield, Mask, Staff, and Accessory. Item stat bonuses share the +10 non-class bonus limit with other bonuses in the in-game view; they do not change base growth.',
    'Stat boosters are permanent base-stat gains, not part of the +10 bonus pool. For entered base/in-game stats or actual comparisons, record boosters already included in those stats so they are not added twice. With untouched app-provided base stats, boosters are added automatically. Each item has a total use limit.',
  ];

  private nextId = 1;
  readonly builds = signal<Build[]>(this.uniqueBuilds(this.storage.takeTransfers()));
  private readonly results = signal<ReadonlyMap<number, BuildResult | null>>(new Map());

  private uniqueBuilds(starts: ProjectionStart[]): Build[] {
    const seen = new Set<string>();
    return starts.flatMap((original) => {
      const start = this.storage.ensureTransaction(original);
      if (seen.has(start.transactionId!)) return [];
      seen.add(start.transactionId!);
      return [{ id: this.nextId++, transactionId: start.transactionId!, start, savedId: null, name: start.name }];
    });
  }

  readonly headings = computed(() => {
    const builds = this.builds();
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();

    builds.forEach((build) => totals.set(build.start.name, (totals.get(build.start.name) ?? 0) + 1));

    return builds.map((build) => {
      const name = build.start.name;

      if (totals.get(name)! < 2) {
        return name;
      }

      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);

      return `${name} ${n}`;
    });
  });

  // --- start modal -------------------------------------------------------------------

  readonly startDialog = signal<StartDialogState | null>(null);

  readonly editing = computed(() => {
    const dialog = this.startDialog();

    return dialog?.editId == null ? null : (this.builds().find((build) => build.id === dialog.editId)?.start ?? null);
  });

  openStart(): void {
    this.startDialog.set({ editId: null, addActuals: false });
  }

  editStart(id: number, addActuals = false): void {
    this.startDialog.set({ editId: id, addActuals });
  }

  onStartConfirmed(start: ProjectionStart): void {
    const editId = this.startDialog()?.editId ?? null;

    if (editId === null) {
      const identified = this.storage.ensureTransaction(start);
      this.builds.update((builds) => builds.some((build) => build.transactionId === identified.transactionId)
        ? builds
        : [...builds, {
            id: this.nextId++, transactionId: identified.transactionId!, start: identified,
            savedId: null, name: identified.name,
          }]);
    } else {
      const savedId = this.builds().find((build) => build.id === editId)?.savedId ?? null;
      const identified = this.storage.ensureTransaction(start);
      this.builds.update((builds) => builds.map((build) => build.id === editId
        ? { ...build, transactionId: identified.transactionId!, start: identified }
        : build));
      if (savedId) {
        const saved = this.storage.overwrite(savedId, start);
        if (saved) this.saveStatus.set(`Saved ${saved.name}.`);
      }
    }

    this.startDialog.set(null);
  }

  saveBuild(id: number): void {
    const build = this.builds().find((candidate) => candidate.id === id);
    if (!build) return;
    const save = build.savedId ? this.storage.overwrite(build.savedId, build.start) : this.storage.create(build.name, build.start);
    if (save) {
      this.builds.update((builds) => builds.map((entry) => entry.id === id ? {
        ...entry,
        transactionId: save.start.transactionId!,
        start: save.start,
        savedId: save.id,
        name: save.name,
      } : entry));
      this.saveStatus.set(`Saved ${save.name}.`);
    }
  }

  renameBuild(id: number, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.builds.update((builds) => builds.map((entry) => entry.id === id ? { ...entry, name: trimmed } : entry));
    const savedId = this.builds().find((entry) => entry.id === id)?.savedId;
    if (savedId) this.storage.rename(savedId, trimmed);
  }

  loadSave(save: ProjectionSave): void {
    const start = this.storage.ensureTransaction(save.start);
    this.builds.update((builds) => builds.some((build) => build.transactionId === start.transactionId)
      ? builds
      : [...builds, {
          id: this.nextId++, transactionId: start.transactionId!, start, savedId: save.id, name: save.name,
        }]);
  }

  deleteSave(id: string): void {
    this.storage.remove(id);
    this.builds.update((builds) => builds.map((build) => build.savedId === id ? { ...build, savedId: null } : build));
  }

  downloadSave(save: ProjectionSave): void {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(save.name)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    void file.text().then((text) => {
      try {
        const save = this.storage.import(JSON.parse(text));
        this.saveStatus.set(`Loaded ${save.name}.`);
      } catch (error) {
        this.saveStatus.set(error instanceof Error ? error.message : 'Could not load that projection.');
      }
    });
  }

  setBuildEquipment(id: number, equipment: readonly string[]): void {
    this.builds.update((builds) => builds.map((build) => build.id === id
      ? { ...build, start: { ...build.start, equipment } } : build));
  }

  setBuildAbilities(id: number, abilities: ProjectionStart['abilities']): void {
    this.builds.update((builds) => builds.map((build) => build.id === id
      ? { ...build, start: { ...build.start, abilities } } : build));
  }

  setBuildBattalion(id: number, battalion: ProjectionStart['battalion']): void {
    this.builds.update((builds) => builds.map((build) => build.id === id
      ? { ...build, start: { ...build.start, battalion } } : build));
  }

  setBuildLevel(id: number, level: number): void {
    this.builds.update((builds) =>
      builds.map((build) =>
        build.id === id ? { ...build, start: { ...build.start, options: { ...build.start.options, level } } } : build,
      ),
    );
  }

  setBoosters(id: number, boosters: BoosterCounts): void {
    this.builds.update((builds) => builds.map((build) => build.id === id
      ? { ...build, start: { ...build.start, boosters: { ...boosters } } } : build));
  }

  removeBuild(id: number): void {
    this.builds.update((builds) => builds.filter((build) => build.id !== id));
    this.results.update((results) => {
      const next = new Map(results);
      next.delete(id);
      return next;
    });
    this.picked.update((picked) => picked.filter((pick) => pick !== id));

    if (!this.canCompare()) {
      this.cancelCompare();
      this.comparisonOpen.set(false);
    }
  }

  onResult(id: number, result: BuildResult | null): void {
    this.results.update((results) => new Map(results).set(id, result));
  }

  // --- comparison (picked like the calculator's Compare Builds) ----------------------

  readonly selectionMode = signal(false);
  readonly picked = signal<number[]>([]);
  private readonly comparisonOpen = signal(false);

  private readonly comparable = computed(() => this.builds().filter((build) => this.results().get(build.id)));

  readonly canCompare = computed(() => this.comparable().length >= 2);
  readonly remainingPicks = computed(() => 2 - this.picked().length);

  readonly comparison = computed(() => {
    const [a, b] = this.picked();
    const resultA = a === undefined ? null : this.labelled(a);
    const resultB = b === undefined ? null : this.labelled(b);

    return this.comparisonOpen() && resultA && resultB ? { a: resultA, b: resultB } : null;
  });

  private labelled(id: number): BuildResult | null {
    const result = this.results().get(id);
    const index = this.builds().findIndex((build) => build.id === id);

    return result ? { ...result, label: this.headings()[index] ?? result.label } : null;
  }

  isPickable(id: number): boolean {
    return Boolean(this.results().get(id));
  }

  isPicked(id: number): boolean {
    return this.picked().includes(id);
  }

  pickNumber(id: number): number {
    return this.picked().indexOf(id) + 1;
  }

  startCompare(): void {
    const comparable = this.comparable();

    if (comparable.length === 2) {
      this.picked.set(comparable.map((build) => build.id));
      this.comparisonOpen.set(true);
      return;
    }

    this.picked.set([]);
    this.selectionMode.set(true);
  }

  cancelCompare(): void {
    this.selectionMode.set(false);
    this.picked.set([]);
  }

  togglePick(id: number): void {
    const next = this.isPicked(id) ? this.picked().filter((pick) => pick !== id) : [...this.picked(), id];

    this.picked.set(next);

    if (next.length === 2) {
      this.selectionMode.set(false);
      this.comparisonOpen.set(true);
    }
  }

  closeComparison(): void {
    this.comparisonOpen.set(false);
    this.picked.set([]);
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projected-stats';
}
