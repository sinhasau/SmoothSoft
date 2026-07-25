/**
 * The default service selection used across check-in, booking, and rebook flows:
 * prefer the client's real history (already filtered to services that still exist
 * in the catalog by the caller), else the location's explicitly configured default
 * (services.is_default — see Settings > Services and migration 0049), else a service
 * literally named "Haircut" (defensive fallback for a catalog with no default set),
 * else whatever's first.
 */
export function resolveDefaultServiceIds(catalog: { id: string; name: string; isDefault?: boolean }[], historyServiceIds: string[]): string[] {
  if (historyServiceIds.length) return historyServiceIds;
  const configured = catalog.find((service) => service.isDefault);
  if (configured) return [configured.id];
  const haircut = catalog.find((service) => service.name.trim().toLowerCase() === 'haircut');
  if (haircut) return [haircut.id];
  return catalog[0] ? [catalog[0].id] : [];
}
