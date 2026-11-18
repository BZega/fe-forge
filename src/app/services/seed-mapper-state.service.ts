import { inject, Injectable, signal } from '@angular/core';

import { DEFAULT_MOUNT_BOND_LEVEL, GrowthRates, MAX_EQUIPPED_ABILITIES, STAT_KEYS, StatKey, WeaponKey, ZERO_GROWTH } from '../models/growth.models';
import { EMPTY_STATS, SeedMapSnapshot, StatValues } from '../models/seed-save';
import { GrowthDataService } from './growth-data.service';
import { equippedItems, equipmentWeapon } from '../models/equipment';

export interface SeedRow {
  id: number;
  marks: GrowthRates;
  reclassTo?: number;
  exam?: InlineExam;
  mount?: { mountId: number | null; mountLevel: number };
}

export interface SeedMarkUpdate {
  sectionId: number;
  rowId: number;
  marks: GrowthRates;
}

export interface InlineExam {
  classId: number | null;
  chance: number;
  passed: boolean;
  keepClass?: boolean;
}

export interface SeedComparator {
  id: number;
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  rows: SeedRow[];
}

export interface SeedExam {
  parentId: number;
  afterRowId: number | null;
  classId: number | null;
  chance: number;
  passed: boolean;
  reclass?: boolean;
  keepClass?: boolean;
}

export interface SeedSection {
  battalionId?: number | null;
  equipment?: string[];
  id: number;
  exam: SeedExam | null;
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  abilities: string[];
  weapon: WeaponKey | null;
  rows: SeedRow[];
  comparators: SeedComparator[];
}

export interface SeedMap {
  unitId: number | null;
  statsLevel: number;
  startStats: StatValues;
  availableClassIds: number[];
  sections: SeedSection[];
}

export interface ExamDraft {
  classId: number;
  chance: number;
  passed: boolean;
  reclass?: boolean;
  keepClass?: boolean;
}

export function switchesClass(exam: { passed: boolean; keepClass?: boolean }): boolean {
  return exam.passed && !exam.keepClass;
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 99;
export const ALWAYS_AVAILABLE_CLASS = 'Noble/Commoner';

export function effectiveClassId(
  sections: readonly SeedSection[],
  section: SeedSection,
): number | null {
  const exam = section.exam;

  if (exam && !switchesClass(exam)) {
    const parent = sections.find((candidate) => candidate.id === exam.parentId);

    return parent ? classAtRow(sections, parent, exam.afterRowId) : null;
  }

  return exam ? (section.classId ?? exam.classId) : section.classId;
}

export function rowSwitchesTo(row: SeedRow): number | null {
  if (row.exam) {
    return switchesClass(row.exam) ? row.exam.classId : null;
  }

  return row.reclassTo ?? null;
}

export function classAtRow(
  sections: readonly SeedSection[],
  section: SeedSection,
  rowId: number | null,
): number | null {
  let classId = effectiveClassId(sections, section);

  if (rowId === null) {
    return classId;
  }

  for (const row of section.rows) {
    classId = rowSwitchesTo(row) ?? classId;

    if (row.id === rowId) {
      break;
    }
  }

  return classId;
}

export function mountAtRow(section: SeedSection, rowId: number | null): { mountId: number | null; mountLevel: number } {
  let mount = { mountId: section.mountId, mountLevel: section.mountLevel };

  if (rowId !== null) {
    for (const row of section.rows) {
      mount = row.mount ?? mount;
      if (row.id === rowId) {
        break;
      }
    }
  }

  return mount;
}

export function availableClassIds(
  map: SeedMap,
  section: SeedSection,
  always: readonly number[],
): Set<number> {
  const available = new Set<number>([...always, ...map.availableClassIds]);
  let current: SeedSection | undefined = section;
  let untilRowId: number | null | undefined;

  while (current) {
    const rows = untilRowId === null ? [] : current.rows;

    for (const row of rows) {
      if (row.exam?.passed && row.exam.classId !== null) {
        available.add(row.exam.classId);
      }

      if (untilRowId !== undefined && row.id === untilRowId) {
        break;
      }
    }

    const exam: SeedExam | null = current.exam;

    if (!exam) {
      break;
    }

    if (exam.passed && exam.classId !== null) {
      available.add(exam.classId);
    }

    untilRowId = exam.afterRowId;
    current = map.sections.find((candidate) => candidate.id === exam.parentId);
  }

  return available;
}

@Injectable({ providedIn: 'root' })
export class SeedMapperStateService {
  private nextSectionId = 1;
  private nextRowId = 1;
  private nextComparatorId = 1;

  private readonly api = inject(GrowthDataService);

  private alwaysAvailable: number[] = [];

  private readonly mapState = signal<SeedMap>(this.createMap());
  private readonly changes = signal(0);
  private readonly activeSave = signal<{ id: string; name: string } | null>(null);

  readonly seedMap = this.mapState.asReadonly();
  readonly changeCount = this.changes.asReadonly();
  readonly loadedSave = this.activeSave.asReadonly();

  constructor() {
    this.api
      .getClasses()
      .subscribe((classes) => {
        this.alwaysAvailable = classes
          .filter((unitClass) => unitClass.name === ALWAYS_AVAILABLE_CLASS)
          .map((unitClass) => unitClass.id);
        this.mapState.update((map) => fillDefaultClass(map, this.alwaysAvailable));
      });
  }

  get alwaysAvailableClassIds(): readonly number[] {
    return this.alwaysAvailable;
  }

  snapshot(): SeedMapSnapshot {
    const map = this.mapState();
    const indexOf = new Map(map.sections.map((section, index) => [section.id, index]));

    return {
      unitId: map.unitId,
      statsLevel: map.statsLevel,
      startStats: { ...map.startStats },
      availableClassIds: [...map.availableClassIds],
      sections: map.sections.map((section) => {
        const exam = section.exam;
        const parent = exam
          ? map.sections.find((candidate) => candidate.id === exam.parentId)
          : undefined;

        return {
          exam:
            exam && parent
              ? {
                  parentIndex: indexOf.get(parent.id) ?? 0,
                  afterRowIndex:
                    exam.afterRowId === null
                      ? null
                      : parent.rows.findIndex((row) => row.id === exam.afterRowId),
                  classId: exam.classId,
                  chance: exam.chance,
                  passed: exam.passed,
                  ...(exam.reclass ? { reclass: true } : {}),
                  ...(exam.keepClass ? { keepClass: true } : {}),
                }
              : null,
          classId: section.classId,
          mountId: section.mountId,
          mountLevel: section.mountLevel,
          abilities: [...section.abilities],
          equipment: [...(section.equipment ?? [])],
          ...(section.battalionId != null ? { battalionId: section.battalionId } : {}),
          weapon: section.weapon,
          rows: section.rows.map((row) => ({ ...row.marks })),
          ...(section.rows.some((row) => row.mount) ? {
            mountChanges: section.rows.flatMap((row, rowIndex) => row.mount ? [{ rowIndex, ...row.mount }] : []),
          } : {}),
          reclasses: section.rows.flatMap((row, rowIndex) =>
            row.reclassTo === undefined ? [] : [{ rowIndex, classId: row.reclassTo }],
          ),
          exams: section.rows.flatMap((row, rowIndex) => (row.exam ? [{ rowIndex, ...row.exam }] : [])),
          comparators: section.comparators.map((comparator) => ({
            classId: comparator.classId,
            mountId: comparator.mountId,
            mountLevel: comparator.mountLevel,
            rows: comparator.rows.map((row) => ({ ...row.marks })),
          })),
        };
      }),
    };
  }

  restore(snapshot: SeedMapSnapshot, save: { id: string; name: string } | null): void {
    const sections: SeedSection[] = [];

    for (const entry of snapshot.sections) {
      const rows = entry.rows.map((marks, rowIndex) => {
        const exam = entry.exams.find((candidate) => candidate.rowIndex === rowIndex);
        const mount = entry.mountChanges?.find((candidate) => candidate.rowIndex === rowIndex);

        return withExam(
          withReclass(
            {
              id: this.nextRowId++, marks: { ...marks },
              ...(mount ? { mount: { mountId: mount.mountId, mountLevel: mount.mountLevel } } : {}),
            },
            entry.reclasses.find((reclass) => reclass.rowIndex === rowIndex)?.classId ?? null,
          ),
          exam
            ? {
                classId: exam.classId,
                chance: exam.chance,
                passed: exam.passed,
                ...(exam.keepClass ? { keepClass: true } : {}),
              }
            : null,
        );
      });
      const parent = entry.exam ? sections[entry.exam.parentIndex] : undefined;

      sections.push({
        id: this.nextSectionId++,
        exam:
          entry.exam && parent
            ? {
                parentId: parent.id,
                afterRowId:
                  entry.exam.afterRowIndex === null
                    ? null
                    : (parent.rows[entry.exam.afterRowIndex]?.id ?? null),
                classId: entry.exam.classId,
                chance: entry.exam.chance,
                passed: entry.exam.passed,
                ...(entry.exam.reclass ? { reclass: true } : {}),
                ...(entry.exam.keepClass ? { keepClass: true } : {}),
              }
            : null,
        classId: entry.classId,
        mountId: entry.mountId,
        mountLevel: entry.mountLevel,
        abilities: [...entry.abilities],
        equipment: [...(entry.equipment ?? [])],
        ...(entry.battalionId != null ? { battalionId: entry.battalionId } : {}),
        weapon: entry.weapon,
        rows,
        comparators: entry.comparators.map((comparator) => ({
          id: this.nextComparatorId++,
          classId: comparator.classId,
          mountId: comparator.mountId,
          mountLevel: comparator.mountLevel,
          rows: rows.map((row, index) => ({
            id: row.id,
            marks: { ...(comparator.rows[index] ?? ZERO_GROWTH) },
          })),
        })),
      });
    }

    const restored: SeedMap = {
      unitId: snapshot.unitId,
      statsLevel: snapshot.statsLevel ?? MIN_LEVEL,
      startStats: { ...snapshot.startStats },
      availableClassIds: [...snapshot.availableClassIds],
      sections: foldEndExams(sections),
    };

    this.mapState.set(
      sections.length > 0
        ? fillDefaultClass(this.includeUsedClasses(restored), this.alwaysAvailable)
        : this.createMap(),
    );
    this.activeSave.set(save);
    this.changes.set(0);
  }

  markSaved(save: { id: string; name: string }): void {
    this.activeSave.set(save);
    this.changes.set(0);
  }

  reset(): void {
    this.mapState.set(this.createMap());
    this.activeSave.set(null);
    this.changes.set(0);
  }

  forgetSave(): void {
    this.activeSave.set(null);
  }

  setUnit(unitId: number | null): void {
    const unit = this.api.unitById(unitId);
    const usable = new Set(this.api.classesForUnit(unit).map((unitClass) => unitClass.id));

    this.mutate((map) => ({
      ...map,
      unitId,
      availableClassIds: map.availableClassIds.filter((id) => usable.has(id)),
    }));
  }

  setStatsLevel(level: number | null): void {
    const clamped =
      level === null || Number.isNaN(level)
        ? MIN_LEVEL
        : Math.min(MAX_LEVEL - 1, Math.max(MIN_LEVEL, Math.round(level)));

    this.mutate((map) => ({ ...map, statsLevel: clamped }));
  }

  addAvailableClass(classId: number): void {
    if (
      this.alwaysAvailable.includes(classId) ||
      this.mapState().availableClassIds.includes(classId)
    ) {
      return;
    }

    this.mutate((map) => ({
      ...map,
      availableClassIds: [...map.availableClassIds, classId],
    }));
  }

  removeAvailableClass(classId: number): void {
    this.mutate((map) => ({
      ...map,
      availableClassIds: map.availableClassIds.filter((id) => id !== classId),
    }));
  }

  setStartStat(stat: StatKey, value: number | null): void {
    const cleaned =
      value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));

    this.mutate((map) => ({
      ...map,
      startStats: { ...map.startStats, [stat]: cleaned },
    }));
  }

  setStartStats(stats: GrowthRates): void {
    this.mutate((map) => ({
      ...map,
      startStats: Object.fromEntries(STAT_KEYS.map((stat) => [stat, Math.max(0, Math.round(stats[stat]))])) as SeedMap['startStats'],
    }));
  }

  setClass(sectionId: number, classId: number | null): void {
    this.patch(sectionId, (section) => {
      if (!section.exam) {
        return { ...section, classId };
      }

      return switchesClass(section.exam)
        ? { ...section, classId: passedExamClass(classId, section.exam.classId) }
        : section;
    });
  }

  setMount(sectionId: number, mountId: number | null): void {
    this.patch(sectionId, (section) => ({ ...section, mountId }));
  }

  setBattalion(sectionId: number, battalionId: number | null): void {
    this.patch(sectionId, (section) => ({ ...section, battalionId }));
  }

  setAbilities(sectionId: number, abilities: readonly string[]): void {
    this.patch(sectionId, (section) => ({
      ...section,
      abilities: [...new Set(abilities)].slice(0, MAX_EQUIPPED_ABILITIES),
    }));
  }

  setEquipment(sectionId: number, names: readonly string[]): void {
    const equipment = equippedItems(names).map((item) => item.Name);
    this.patch(sectionId, (section) => ({ ...section, equipment, weapon: equipmentWeapon(equipment) }));
  }

  setMountLevel(sectionId: number, mountLevel: number): void {
    this.patch(sectionId, (section) => ({ ...section, mountLevel }));
  }

  setRowMount(sectionId: number, rowId: number, mountId: number | null, mountLevel: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) => row.id === rowId ? { ...row, mount: { mountId, mountLevel } } : row),
    }));
  }

  clearRowMount(sectionId: number, rowId: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const { mount: _, ...rest } = row;
        return rest;
      }),
    }));
  }

  addLevel(sectionId: number): void {
    this.patch(sectionId, (section) => {
      const row = this.createRow();

      return {
        ...section,
        rows: [...section.rows, row],
        comparators: section.comparators.map((comparator) => ({
          ...comparator,
          rows: [...comparator.rows, { id: row.id, marks: { ...ZERO_GROWTH } }],
        })),
      };
    });
  }

  addLevels(sectionId: number, marks: readonly GrowthRates[], shared: readonly SeedMarkUpdate[]): void {
    const rows = marks.map((marks) => ({ ...this.createRow(), marks: { ...marks } }));
    const updates = new Map<number, Map<number, GrowthRates>>();
    for (const update of shared) {
      const section = updates.get(update.sectionId) ?? new Map<number, GrowthRates>();
      section.set(update.rowId, update.marks);
      updates.set(update.sectionId, section);
    }
    this.mutate((map) => ({
      ...map,
      sections: map.sections.map((section) => ({
        ...section,
        rows: [
          ...section.rows.map((row) => {
            const marks = updates.get(section.id)?.get(row.id);
            return marks ? { ...row, marks: { ...marks } } : row;
          }),
          ...(section.id === sectionId ? rows : []),
        ],
        comparators: section.id === sectionId ? section.comparators.map((comparator) => ({
          ...comparator,
          rows: [...comparator.rows, ...rows.map((row) => ({ id: row.id, marks: { ...ZERO_GROWTH } }))],
        })) : section.comparators,
      })),
    }));
  }

  removeLevel(sectionId: number, rowId: number): void {
    if (this.isBranchRow(sectionId, rowId)) {
      return;
    }

    this.patch(sectionId, (section) =>
      section.rows.length <= 1
        ? section
        : {
            ...section,
            rows: section.rows.filter((row) => row.id !== rowId),
            comparators: section.comparators.map((comparator) => ({
              ...comparator,
              rows: comparator.rows.filter((row) => row.id !== rowId),
            })),
          },
    );
  }

  toggleStat(sectionId: number, rowId: number, stat: StatKey): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: toggle(section.rows, rowId, stat),
    }));
  }

  setMarks(targets: readonly { sectionId: number; rowId: number }[], stat: StatKey, value: number): void {
    const bySection = new Map<number, Set<number>>();

    for (const { sectionId, rowId } of targets) {
      bySection.set(sectionId, (bySection.get(sectionId) ?? new Set()).add(rowId));
    }

    this.mutate((map) => ({
      ...map,
      sections: map.sections.map((section) => {
        const rowIds = bySection.get(section.id);

        return rowIds
          ? {
              ...section,
              rows: section.rows.map((row) =>
                rowIds.has(row.id) ? { ...row, marks: { ...row.marks, [stat]: value } } : row,
              ),
            }
          : section;
      }),
    }));
  }

  setReclass(sectionId: number, rowId: number, classId: number | null): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.id === rowId ? withReclass(withExam(row, null), classId) : row,
      ),
    }));
  }

  addReclassLevel(sectionId: number, classId: number): void {
    this.addLevel(sectionId);

    const rowId = this.mapState().sections.find((section) => section.id === sectionId)?.rows.at(-1)?.id;

    if (rowId !== undefined) {
      this.setReclass(sectionId, rowId, classId);
    }
  }

  setInlineExam(sectionId: number, rowId: number, exam: InlineExam | null): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.id === rowId ? withExam(withReclass(row, null), exam) : row,
      ),
    }));
  }

  addExamLevel(sectionId: number, exam: InlineExam): void {
    this.addLevel(sectionId);

    const rowId = this.mapState().sections.find((section) => section.id === sectionId)?.rows.at(-1)?.id;

    if (rowId !== undefined) {
      this.setInlineExam(sectionId, rowId, exam);
    }
  }

  addComparator(sectionId: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: [
        ...section.comparators,
        {
          id: this.nextComparatorId++,
          classId: null,
          mountId: null,
          mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
          rows: section.rows.map((row) => ({
            id: row.id,
            marks: { ...ZERO_GROWTH },
          })),
        },
      ],
    }));
  }

  removeComparator(sectionId: number, comparatorId: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: section.comparators.filter((c) => c.id !== comparatorId),
    }));
  }

  setComparatorClass(
    sectionId: number,
    comparatorId: number,
    classId: number | null,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      classId,
      mountId: null,
      mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
    }));
  }

  setComparatorMount(
    sectionId: number,
    comparatorId: number,
    mountId: number | null,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      mountId,
    }));
  }

  setComparatorMountLevel(sectionId: number, comparatorId: number, mountLevel: number): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      mountLevel,
    }));
  }

  toggleComparatorStat(
    sectionId: number,
    comparatorId: number,
    rowId: number,
    stat: StatKey,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      rows: toggle(comparator.rows, rowId, stat),
    }));
  }

  addExam(parentId: number, afterRowId: number | null, draft: ExamDraft): number | null {
    const parent = this.mapState().sections.find((section) => section.id === parentId);

    if (!parent || this.hasExamAfter(parentId, afterRowId)) {
      return null;
    }

    const switches = switchesClass(draft);
    const section: SeedSection = {
      id: this.nextSectionId++,
      exam: {
        parentId,
        afterRowId,
        classId: draft.classId,
        chance: draft.chance,
        passed: draft.passed,
        ...(draft.passed && draft.keepClass ? { keepClass: true } : {}),
      },
      classId: null,
      mountId: switches ? null : mountAtRow(parent, afterRowId).mountId,
      mountLevel: switches ? DEFAULT_MOUNT_BOND_LEVEL : mountAtRow(parent, afterRowId).mountLevel,
      abilities: [...parent.abilities],
      equipment: [...(parent.equipment ?? [])],
      battalionId: parent.battalionId ?? null,
      weapon: parent.weapon,
      rows: [this.createRow()],
      comparators: [],
    };

    this.mutate((map) => ({ ...map, sections: [...map.sections, section] }));

    return section.id;
  }

  addBranch(parentId: number, afterRowId: number | null, draft: ExamDraft): number | null {
    const parent = this.mapState().sections.find((section) => section.id === parentId);

    if (!parent) {
      return null;
    }

    const reclass = draft.reclass === true;
    const passed = reclass || draft.passed;
    const keepClass = !reclass && draft.passed && draft.keepClass === true;
    const switches = passed && !keepClass;
    const section: SeedSection = {
      id: this.nextSectionId++,
      exam: {
        parentId,
        afterRowId,
        classId: draft.classId,
        chance: reclass ? 0 : draft.chance,
        passed,
        ...(reclass ? { reclass: true } : {}),
        ...(keepClass ? { keepClass: true } : {}),
      },
      classId: null,
      mountId: switches ? null : mountAtRow(parent, afterRowId).mountId,
      mountLevel: switches ? DEFAULT_MOUNT_BOND_LEVEL : mountAtRow(parent, afterRowId).mountLevel,
      abilities: [...parent.abilities],
      equipment: [...(parent.equipment ?? [])],
      battalionId: parent.battalionId ?? null,
      weapon: parent.weapon,
      rows: [this.createRow()],
      comparators: [],
    };

    this.mutate((map) => ({ ...map, sections: [...map.sections, section] }));

    return section.id;
  }

  updateExam(sectionId: number, draft: ExamDraft): void {
    this.patch(sectionId, (section) =>
      section.exam
        ? {
            ...section,
            exam: {
              ...withoutKeepClass(section.exam),
              classId: draft.classId,
              chance: draft.chance,
              passed: draft.passed,
              ...(draft.passed && draft.keepClass ? { keepClass: true } : {}),
            },
            classId: switchesClass(draft) ? passedExamClass(section.classId, draft.classId) : null,
          }
        : section,
    );
  }

  canRemoveSection(sectionId: number): boolean {
    const sections = this.mapState().sections;

    return (
      sections.find((section) => section.id === sectionId)?.exam != null &&
      !sections.some((section) => section.exam?.parentId === sectionId)
    );
  }

  hasExamAfter(sectionId: number, rowId: number | null): boolean {
    return this.mapState().sections.some(
      (section) =>
        section.exam?.parentId === sectionId && section.exam.afterRowId === rowId,
    );
  }

  isBranchRow(sectionId: number, rowId: number): boolean {
    const rows = this.mapState().sections.find((section) => section.id === sectionId)?.rows ?? [];
    const index = rows.findIndex((row) => row.id === rowId);
    const before = index <= 0 ? null : rows[index - 1].id;

    return this.hasExamAfter(sectionId, rowId) || this.hasExamAfter(sectionId, before);
  }

  removeSection(sectionId: number): void {
    if (!this.canRemoveSection(sectionId)) {
      return;
    }

    this.mutate((map) => ({
      ...map,
      sections: map.sections.filter((section) => section.id !== sectionId),
    }));
  }

  private mutate(change: (map: SeedMap) => SeedMap): void {
    this.mapState.update((map) =>
      fillDefaultClass(
        clearUnavailableClasses(resetChangedClasses(map, change(map)), this.alwaysAvailable),
        this.alwaysAvailable,
      ),
    );
    this.changes.update((count) => count + 1);
  }

  private includeUsedClasses(map: SeedMap): SeedMap {
    const extra = new Set(map.availableClassIds);

    for (const section of map.sections) {
      const available = availableClassIds(map, section, this.alwaysAvailable);
      const used = [
        section.classId,
        ...section.comparators.map((comparator) => comparator.classId),
      ];

      for (const classId of used) {
        if (classId !== null && !available.has(classId)) {
          extra.add(classId);
        }
      }
    }

    return extra.size === map.availableClassIds.length
      ? map
      : { ...map, availableClassIds: [...extra] };
  }

  private patch(sectionId: number, change: (section: SeedSection) => SeedSection): void {
    this.mutate((map) => ({
      ...map,
      sections: map.sections.map((section) =>
        section.id === sectionId ? change(section) : section,
      ),
    }));
  }

  private patchComparator(
    sectionId: number,
    comparatorId: number,
    change: (comparator: SeedComparator) => SeedComparator,
  ): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: section.comparators.map((comparator) =>
        comparator.id === comparatorId ? change(comparator) : comparator,
      ),
    }));
  }

  private createMap(): SeedMap {
    return fillDefaultClass(
      {
        unitId: null,
        statsLevel: MIN_LEVEL,
        startStats: { ...EMPTY_STATS },
        availableClassIds: [],
        sections: [
          {
            id: this.nextSectionId++,
            exam: null,
            classId: null,
            mountId: null,
            mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
            abilities: [],
            equipment: [],
            weapon: null,
            rows: [this.createRow()],
            comparators: [],
          },
        ],
      },
      this.alwaysAvailable,
    );
  }

  private createRow(): SeedRow {
    return { id: this.nextRowId++, marks: { ...ZERO_GROWTH } };
  }
}

function resetChangedClasses(before: SeedMap, after: SeedMap): SeedMap {
  let changed = false;

  const sections = after.sections.map((section) => {
    const previous = before.sections.find((candidate) => candidate.id === section.id);
    const classId = effectiveClassId(after.sections, section);

    if (!previous || effectiveClassId(before.sections, previous) === classId) {
      return section;
    }

    changed = true;

    return {
      ...section,
      mountId: null,
      mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
      comparators: section.comparators.map((comparator) =>
        comparator.classId === classId
          ? { ...comparator, classId: null, mountId: null, mountLevel: DEFAULT_MOUNT_BOND_LEVEL }
          : comparator,
      ),
    };
  });

  return changed ? { ...after, sections } : after;
}

function fillDefaultClass(map: SeedMap, always: readonly number[]): SeedMap {
  const base = map.sections.find((section) => !section.exam);
  const fallback = always[0];

  if (!base || base.classId !== null || fallback === undefined) {
    return map;
  }

  return {
    ...map,
    sections: map.sections.map((section) =>
      section === base ? { ...section, classId: fallback } : section,
    ),
  };
}

function clearUnavailableClasses(map: SeedMap, always: readonly number[]): SeedMap {
  let changed = false;

  const sections = map.sections.map((section) => {
    const available = availableClassIds(map, section, always);
    const keep = (classId: number | null) => classId === null || available.has(classId);
    const baseClassValid = keep(section.classId);
    const comparatorsValid = section.comparators.every((comparator) => keep(comparator.classId));
    const reclassesValid = section.rows.every((row) => keep(row.reclassTo ?? null));

    if (baseClassValid && comparatorsValid && reclassesValid) {
      return section;
    }

    changed = true;

    return {
      ...section,
      classId: baseClassValid ? section.classId : null,
      mountId: baseClassValid ? section.mountId : null,
      mountLevel: baseClassValid ? section.mountLevel : DEFAULT_MOUNT_BOND_LEVEL,
      rows: section.rows.map((row) => (keep(row.reclassTo ?? null) ? row : withReclass(row, null))),
      comparators: section.comparators.map((comparator) =>
        keep(comparator.classId)
          ? comparator
          : { ...comparator, classId: null, mountId: null, mountLevel: DEFAULT_MOUNT_BOND_LEVEL },
      ),
    };
  });

  return changed ? { ...map, sections } : map;
}

function passedExamClass(chosen: number | null, examClassId: number | null): number | null {
  return chosen === examClassId ? null : chosen;
}

function withoutKeepClass<T extends { keepClass?: boolean }>(exam: T): T {
  const { keepClass: _, ...rest } = exam;

  return rest as T;
}

function withReclass(row: SeedRow, classId: number | null): SeedRow {
  const { reclassTo: _, ...rest } = row;

  return classId === null ? rest : { ...rest, reclassTo: classId };
}

function withExam(row: SeedRow, exam: InlineExam | null): SeedRow {
  const { exam: _, ...rest } = row;

  return exam === null ? rest : { ...rest, exam: { ...exam } };
}

function foldEndExams(sections: SeedSection[]): SeedSection[] {
  let result = sections;
  let folded = true;

  while (folded) {
    folded = false;

    for (const section of result) {
      const exam = section.exam;
      const parent = exam && result.find((candidate) => candidate.id === exam.parentId);
      const siblings = exam
        ? result.filter(
            (candidate) =>
              candidate.exam?.parentId === exam.parentId && candidate.exam.afterRowId === exam.afterRowId,
          ).length
        : 0;

      if (!exam || !parent || exam.reclass || siblings > 1 || !canFold(section, parent, exam)) {
        continue;
      }

      const [first, ...rest] = section.rows;
      const parentMount = mountAtRow(parent, exam.afterRowId);
      const firstRow = first.mount || (section.mountId === parentMount.mountId && section.mountLevel === parentMount.mountLevel)
        ? first
        : { ...first, mount: { mountId: section.mountId, mountLevel: section.mountLevel } };
      const merged: SeedSection = {
        ...parent,
        rows: [
          ...parent.rows,
          withExam(withReclass(firstRow, null), {
            classId: exam.classId,
            chance: exam.chance,
            passed: exam.passed,
            ...(exam.keepClass ? { keepClass: true } : {}),
          }),
          ...rest,
        ],
        comparators: [],
      };

      result = result
        .filter((candidate) => candidate.id !== section.id)
        .map((candidate) => {
          if (candidate.id === parent.id) {
            return merged;
          }

          return candidate.exam?.parentId === section.id
            ? { ...candidate, exam: { ...candidate.exam, parentId: parent.id } }
            : candidate;
        });
      folded = true;
      break;
    }
  }

  return result;
}

function canFold(section: SeedSection, parent: SeedSection, exam: SeedExam): boolean {
  const atEnd = parent.rows.length > 0 && exam.afterRowId === parent.rows.at(-1)!.id;
  const switches = switchesClass(exam);
  const parentMount = mountAtRow(parent, exam.afterRowId);
  const sameMount = switches
    ? section.mountId === null || (section.mountId === parentMount.mountId && section.mountLevel === parentMount.mountLevel)
    : section.mountId === parentMount.mountId && section.mountLevel === parentMount.mountLevel;
  const sameClass = !switches || section.classId === null || section.classId === exam.classId;
  const first = section.rows[0];

  return (
    atEnd &&
    sameMount &&
    sameClass &&
    first !== undefined &&
    first.reclassTo === undefined &&
    section.comparators.length === 0 &&
    parent.comparators.length === 0 &&
    section.weapon === parent.weapon &&
    (section.battalionId ?? null) === (parent.battalionId ?? null) &&
    section.abilities.join('\n') === parent.abilities.join('\n')
  );
}

function toggle(rows: SeedRow[], rowId: number, stat: StatKey): SeedRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, marks: { ...row.marks, [stat]: row.marks[stat] > 0 ? 0 : 1 } }
      : row,
  );
}
