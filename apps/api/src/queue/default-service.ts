/**
 * The public page's default service selection: prefer the client's real
 * history (already filtered to services that still exist in the catalog by
 * the caller), else a service literally named "Haircut" at this location,
 * else whatever's first in the catalog.
 */
export function resolveDefaultServiceIds(catalog: { id: string; name: string }[], historyServiceIds: string[]): string[] {
  if (historyServiceIds.length) return historyServiceIds;
  const haircut = catalog.find((service) => service.name.trim().toLowerCase() === 'haircut');
  if (haircut) return [haircut.id];
  return catalog[0] ? [catalog[0].id] : [];
}
