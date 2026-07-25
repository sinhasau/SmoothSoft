import { describe, expect, it } from 'vitest';
import { resolveDefaultServiceIds } from './default-service';

const catalog = [
  { id: 'svc-fade', name: 'Skin fade' },
  { id: 'svc-haircut', name: 'Haircut' },
  { id: 'svc-beard', name: 'Beard trim' },
];

describe('resolveDefaultServiceIds', () => {
  it('prefers real history when present', () => {
    expect(resolveDefaultServiceIds(catalog, ['svc-fade', 'svc-beard'])).toEqual(['svc-fade', 'svc-beard']);
  });

  it('falls back to Haircut when there is no history', () => {
    expect(resolveDefaultServiceIds(catalog, [])).toEqual(['svc-haircut']);
  });

  it('falls back to the first catalog service when this location has no Haircut', () => {
    const noHaircut = catalog.filter((service) => service.name !== 'Haircut');
    expect(resolveDefaultServiceIds(noHaircut, [])).toEqual(['svc-fade']);
  });

  it('returns nothing for an empty catalog with no history', () => {
    expect(resolveDefaultServiceIds([], [])).toEqual([]);
  });

  it('prefers the explicitly configured default over the Haircut-name fallback', () => {
    const withDefault = catalog.map((service) => ({ ...service, isDefault: service.id === 'svc-fade' }));
    expect(resolveDefaultServiceIds(withDefault, [])).toEqual(['svc-fade']);
  });

  it('history still wins over the configured default', () => {
    const withDefault = catalog.map((service) => ({ ...service, isDefault: service.id === 'svc-fade' }));
    expect(resolveDefaultServiceIds(withDefault, ['svc-beard'])).toEqual(['svc-beard']);
  });
});
