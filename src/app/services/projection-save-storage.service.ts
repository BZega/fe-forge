import { Injectable, signal } from '@angular/core';
import type { ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';

export interface ProjectionSave {
  id: string;
  name: string;
  savedAt: string;
  start: ProjectionStart;
}

const STORAGE_KEY = 'fe-forge.projection-saves';

@Injectable({ providedIn: 'root' })
export class ProjectionSaveStorageService {
  private readonly saveList = signal<ProjectionSave[]>(this.read());
  readonly saves = this.saveList.asReadonly();
  readonly pendingTransfers = signal<ProjectionStart[]>([]);

  create(name: string, start: ProjectionStart): ProjectionSave {
    const transactionId = this.ensureTransaction(start).transactionId!;
    const existing = this.saveList().find((save) => save.start.transactionId === transactionId);
    if (existing) {
      return this.overwrite(existing.id, start)!;
    }
    const save: ProjectionSave = {
      id: this.transactionId(),
      name,
      savedAt: new Date().toISOString(),
      start: this.ensureTransaction(start),
    };
    this.commit([...this.saveList(), save]);
    return save;
  }

  overwrite(id: string, start: ProjectionStart): ProjectionSave | null {
    const existing = this.saveList().find((save) => save.id === id) ?? null;
    if (!existing) return null;
    const updated = { ...existing, savedAt: new Date().toISOString(), start: this.ensureTransaction(start) };
    this.commit(this.saveList().map((save) => save.id === id ? updated : save));
    return updated;
  }

  rename(id: string, name: string): void {
    this.commit(this.saveList().map((save) => save.id === id ? { ...save, name } : save));
  }

  remove(id: string): void {
    this.commit(this.saveList().filter((save) => save.id !== id));
  }

  import(raw: unknown): ProjectionSave {
    if (typeof raw !== 'object' || raw === null) throw new Error('This is not a projected stats save.');
    const entry = raw as Partial<ProjectionSave>;
    if (typeof entry.name !== 'string' || typeof entry.savedAt !== 'string'
      || typeof entry.start !== 'object' || entry.start === null) {
      throw new Error('This projected stats save is incomplete.');
    }
    const start = this.ensureTransaction(entry.start as ProjectionStart);
    const existing = this.saveList().find((save) => save.start.transactionId === start.transactionId);
    const save: ProjectionSave = {
      id: existing?.id ?? this.transactionId(),
      name: entry.name.trim() || start.name,
      savedAt: entry.savedAt,
      start,
    };
    this.commit(existing
      ? this.saveList().map((candidate) => candidate.id === existing.id ? save : candidate)
      : [...this.saveList(), save]);
    return save;
  }

  transfer(start: ProjectionStart): void {
    const transferred = this.ensureTransaction(start);
    this.pendingTransfers.update((transfers) =>
      transfers.some((entry) => entry.transactionId === transferred.transactionId)
        ? transfers
        : [...transfers, transferred],
    );
  }

  takeTransfers(): ProjectionStart[] {
    const transfers = this.pendingTransfers();
    this.pendingTransfers.set([]);
    return transfers;
  }

  ensureTransaction(start: ProjectionStart): ProjectionStart {
    return { ...structuredClone(start), transactionId: start.transactionId ?? this.transactionId() };
  }

  transactionIdForTransfer(): string {
    return this.transactionId();
  }

  private transactionId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  }

  private commit(saves: ProjectionSave[]): void {
    this.saveList.set(saves);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    } catch {
      // Keep the in-memory save usable when storage is unavailable.
    }
  }

  private read(): ProjectionSave[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      return parsed.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null || typeof entry.id !== 'string'
          || typeof entry.name !== 'string' || typeof entry.savedAt !== 'string'
          || typeof entry.start !== 'object' || entry.start === null) return [];
        const save = { ...entry, start: this.ensureTransaction(entry.start as ProjectionStart) } as ProjectionSave;
        if (seen.has(save.start.transactionId!)) return [];
        seen.add(save.start.transactionId!);
        return [save];
      });
    } catch {
      return [];
    }
  }
}
