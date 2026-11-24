import { routeSlug } from './route-slug';

export function prerenderParams(rows: readonly { id: number; name: string }[]): Record<string, string>[] {
  const params = rows.flatMap((row) => [{ id: routeSlug(row.name) }, { id: String(row.id) }]);
  return params.filter((entry, index) => params.findIndex((candidate) => candidate.id === entry.id) === index);
}
