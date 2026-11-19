import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, input, model, signal, untracked, viewChild } from '@angular/core';
import { GrowthRates, Mount, mountBonusAt, mountGrowthAt, STAT_KEYS, STAT_LABELS, StatKey } from '../models/growth.models';
import type { SectionView, SeedMapperPageComponent, StatTotal } from '../seed-mapper-page/seed-mapper-page.component';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { skillIconUrl, useFallbackIcon } from '../icon-links';
import { boosterDescription } from '../models/stat-boosters';

interface TimelineLevel {
  kind: 'level';
  key: string;
  view: SectionView;
  rowIndex: number;
  level: number;
  className: string;
  marks: GrowthRates;
  auto: Record<StatKey, boolean>;
  editable: boolean;
  source: string | null;
  note: string | null;
  mount: Mount | null;
  bondLevel: number | null;
  mountEditable: boolean;
  mountHasBonus: boolean;
}

interface ForkOption {
  sectionId: number;
  label: string;
  active: boolean;
}

interface TimelineFork {
  kind: 'fork';
  key: string;
  level: number;
  options: ForkOption[];
}

interface TimelineBranch {
  kind: 'branch';
  key: string;
  label: string;
  detail: string;
}

interface TimelineGrowth {
  kind: 'growth';
  key: string;
  className: string;
  growth: GrowthRates;
  details: Record<StatKey, { boosted: boolean; title: string }>;
}

type TimelineItem = TimelineLevel | TimelineFork | TimelineBranch | TimelineGrowth;

interface TimelineOption {
  id: number;
  label: string;
}

@Component({
  selector: 'app-seed-timeline',
  imports: [SearchableSelectComponent],
  templateUrl: './seed-timeline.component.html',
  styleUrl: './seed-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--timeline-bar-height]': 'barHeight() + "px"' },
})
export class SeedTimelineComponent {
  readonly mapper = input.required<SeedMapperPageComponent>();
  readonly mountEditorKey = signal<string | null>(null);
  readonly useFallbackIcon = useFallbackIcon;
  readonly timelineBar = viewChild<ElementRef<HTMLElement>>('timelineBar');
  readonly barHeight = signal(0);

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;

  readonly focusId = model<number | null>(null);

  private readonly views = computed(() => this.mapper().sectionViews());

  readonly focused = computed<SectionView | null>(
    () => this.views().find((view) => view.section.id === this.focusId()) ?? this.views().at(-1) ?? null,
  );

  constructor() {
    afterRenderEffect((onCleanup) => {
      const bar = this.timelineBar()?.nativeElement;
      if (!bar) return;
      const observer = new ResizeObserver(() => this.barHeight.set(bar.getBoundingClientRect().height));
      observer.observe(bar);
      this.barHeight.set(bar.getBoundingClientRect().height);
      onCleanup(() => observer.disconnect());
    });
    effect(() => {
      this.mapper().timelineResetVersion();
      untracked(() => this.focusId.set(null));
    });

    effect(() => {
      const created = this.mapper().createdBranchId();

      if (created !== null) {
        untracked(() => {
          if (this.focusId() !== null) {
            this.focusId.set(created);
          }
          this.mapper().createdBranchId.set(null);
        });
      }
    });
  }

  private chainOf(view: SectionView): SectionView[] {
    const byId = new Map(this.views().map((candidate) => [candidate.section.id, candidate]));
    const chain: SectionView[] = [];
    let current: SectionView | undefined = view;

    while (current) {
      chain.unshift(current);
      const parentId: number | undefined = current.section.exam?.parentId;
      current = parentId === undefined ? undefined : byId.get(parentId);
    }

    return chain;
  }

  private branchLabel(view: SectionView): string {
    const exam = view.section.exam;
    const name = this.mapper().className(view.classId);

    if (!exam) {
      return view.title;
    }

    if (exam.reclass) {
      return `↻ ${name}`;
    }

    return `${this.mapper().className(exam.classId)} ${exam.passed ? '✓' : '✗'}${exam.keepClass ? ` (stay ${name})` : ''}`;
  }

  readonly timelines = computed<TimelineOption[]>(() =>
    this.views().map((view) => ({
      id: view.section.id,
      label: view.section.exam ? `→ ${this.branchLabel(view)} Lv ${view.firstLevel}` : 'Seed',
    })),
  );

  private childrenAt(view: SectionView, afterRowId: number | null): SectionView[] {
    return this.views().filter(
      (candidate) =>
        candidate.section.exam?.parentId === view.section.id && candidate.section.exam.afterRowId === afterRowId,
    );
  }

  private fork(view: SectionView, afterRowId: number | null, level: number, activeId: number): TimelineFork {
    return {
      kind: 'fork',
      key: `fork-${view.section.id}-${afterRowId ?? 'start'}`,
      level,
      options: [
        { sectionId: view.section.id, label: 'No branch', active: activeId === view.section.id },
        ...this.childrenAt(view, afterRowId).map((child) => ({
          sectionId: child.section.id,
          label: this.branchLabel(child),
          active: activeId === child.section.id,
        })),
      ],
    };
  }

  private levelItem(view: SectionView, rowIndex: number, focused: SectionView): TimelineLevel {
    const mapper = this.mapper();
    const row = view.section.rows[rowIndex];
    const owner = mapper.rowOwner(view, rowIndex);
    const ownRow = owner.view.section.id === view.section.id && owner.rowIndex === rowIndex;
    const ownerRow = owner.view.section.rows[owner.rowIndex] ?? row;
    const cells = mapper.effectiveRow(mapper.rowGrowth(view, rowIndex), ownerRow, mapper.slotOf(view, rowIndex));
    const inherited = view.section.id !== focused.section.id;
    let source: string | null = null;

    if (!ownRow) {
      source = `Same roll and growth rates as ${owner.view.title} Lv ${mapper.levelOf(owner.view, owner.rowIndex)}`;
    } else if (inherited) {
      source = `Shared with ${view.title}; focus it to edit`;
    }

    let note: string | null = null;

    if (row.exam) {
      note = `${row.exam.passed ? 'Exam' : 'Skip'}: ${mapper.className(row.exam.classId)}`;
    } else if (row.reclassTo !== undefined) {
      note = `Reclass: ${mapper.className(row.reclassTo)}`;
    }
    const boosters = boosterDescription(view.section.boosters?.find((use) => use.rowId === row.id)?.counts ?? {});
    if (boosters) note = [note, boosters].filter(Boolean).join(' · ');

    const { mount, level: bondLevel } = mapper.rowMount(view, rowIndex);
    const mountGrowth = mountGrowthAt(mount, bondLevel);
    const mountBonus = mountBonusAt(mount, bondLevel);

    return {
      kind: 'level',
      key: `level-${view.section.id}-${row.id}`,
      view,
      rowIndex,
      level: mapper.levelOf(view, rowIndex),
      className: mapper.className(mapper.rowClassId(view, rowIndex)),
      marks: cells.marks,
      auto: cells.auto,
      editable: ownRow && !inherited,
      source,
      note,
      mount,
      bondLevel,
      mountEditable: !inherited,
      mountHasBonus: this.statKeys.some((stat) => mountGrowth[stat] !== 0 || mountBonus[stat] !== 0),
    };
  }

  readonly items = computed<TimelineItem[]>(() => {
    const focused = this.focused();

    if (!focused) {
      return [];
    }

    const mapper = this.mapper();
    const chain = this.chainOf(focused);
    const items: TimelineItem[] = [];
    let shownGrowth: string | null = null;

    const pushLevel = (view: SectionView, rowIndex: number) => {
      const growth = mapper.rowGrowth(view, rowIndex);
      const details = mapper.rowGrowthDetails(view, rowIndex);
      const growthKey = growth && this.statKeys.map((stat) => `${growth[stat]}:${details[stat].title}`).join(',');

      if (growth && growthKey !== shownGrowth) {
        shownGrowth = growthKey;
        items.push({
          kind: 'growth',
          key: `growth-${view.section.id}-${view.section.rows[rowIndex].id}`,
          className: mapper.className(mapper.rowClassId(view, rowIndex)),
          growth,
          details,
        });
      }

      items.push(this.levelItem(view, rowIndex, focused));
    };

    chain.forEach((view, linkIndex) => {
      const next = chain[linkIndex + 1];
      const rows = view.section.rows;
      const cutRowId = next?.section.exam?.afterRowId;
      const lastIndex = next ? (cutRowId === null ? -1 : rows.findIndex((row) => row.id === cutRowId)) : rows.length - 1;

      for (let rowIndex = 0; rowIndex <= lastIndex; rowIndex++) {
        const before = rowIndex === 0 ? null : rows[rowIndex - 1].id;

        if (this.childrenAt(view, before).length > 0) {
          items.push(this.fork(view, before, mapper.levelOf(view, rowIndex), view.section.id));
        }

        pushLevel(view, rowIndex);
      }

      if (next) {
        const exam = next.section.exam!;

        items.push(this.fork(view, cutRowId ?? null, next.firstLevel, next.section.id));
        items.push({
          kind: 'branch',
          key: `branch-${next.section.id}`,
          label: exam.reclass
            ? `Reclass to ${mapper.className(exam.classId)}`
            : `${mapper.className(exam.classId)} exam ${exam.passed ? 'passed' : 'failed'} · ${exam.chance}%${
                exam.keepClass ? ` · stayed in ${mapper.className(next.classId)}` : ''
              }`,
          detail: exam.reclass
            ? `From Lv ${next.firstLevel}; no roll used`
            : `Uses the Lv ${next.firstLevel} roll; Lv ${next.firstLevel} comes from the roll after it`,
        });
      } else if (rows.length > 0 && this.childrenAt(view, rows.at(-1)!.id).length > 0) {
        items.push(this.fork(view, rows.at(-1)!.id, mapper.levelOf(view, rows.length), view.section.id));
      }
    });

    return items;
  });

  asLevel(item: TimelineItem): TimelineLevel | null {
    return item.kind === 'level' ? item : null;
  }

  asFork(item: TimelineItem): TimelineFork | null {
    return item.kind === 'fork' ? item : null;
  }

  asBranch(item: TimelineItem): TimelineBranch | null {
    return item.kind === 'branch' ? item : null;
  }

  asGrowth(item: TimelineItem): TimelineGrowth | null {
    return item.kind === 'growth' ? item : null;
  }

  focusBranch(sectionId: number): void {
    this.focusId.set(sectionId);
  }

  onTimelineChange(value: string): void {
    this.focusId.set(value === 'current' ? null : Number(value));
  }

  toggle(item: TimelineLevel, stat: StatKey): void {
    if (!item.editable) {
      return;
    }

    const row = item.view.section.rows[item.rowIndex];
    this.mapper().setSharedMark(item.view, item.rowIndex, stat, !(row.marks[stat] > 0));
  }

  mountIcon(item: TimelineLevel): string {
    const preference = item.mountEditable && this.mountEditorKey() === item.key ? 'neutral' : item.mountHasBonus ? 'good' : 'bad';
    return skillIconUrl('riding', preference) ?? this.mountFallbackIcon(item);
  }

  mountFallbackIcon(item: TimelineLevel): string {
    const color = item.mountEditable && this.mountEditorKey() === item.key ? 'black' : item.mountHasBonus ? 'gold' : 'silver';
    return `icons/skills/${color}/riding.svg`;
  }

  branchFrom(item: TimelineLevel): void {
    this.mapper().openBranchAt(item.view, item.rowIndex);
  }

  removeLastLevel(view: SectionView): void {
    const last = view.section.rows.at(-1);

    if (last && view.section.rows.length > 1) {
      this.mapper().removeLevel(view, last);
    }
  }

  removeBranch(view: SectionView): void {
    const parentId = view.section.exam?.parentId ?? null;

    this.mapper().removeSection(view);
    if (this.focusId() !== null) {
      this.focusId.set(parentId);
    }
  }

  endTotals(view: SectionView): StatTotal[] {
    return this.mapper().endStatsOf(view);
  }
}
