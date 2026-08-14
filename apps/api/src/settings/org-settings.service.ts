import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { db } from '../common/request-context';
import { PG_POOL } from '../db/database.module';
import { runInLocationScope } from '../db/scoped-query';
import { ORG_SETTING_FIELDS, fieldByKey, parseSettingValue } from './org-settings-fields';

/** How far a change reaches. Chosen by the owner on every save. */
export type ApplyScope = 'future' | 'all';

@Injectable()
export class OrgSettingsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The org defaults, plus what each shop currently has.
   *
   * Showing the per-location values matters: without them "future stores only"
   * is invisible, and an owner cannot tell whether a shop has deliberately
   * diverged or was simply never pushed to.
   */
  async get(organizationId: string) {
    const trx = db();
    const [defaults, locations] = await Promise.all([
      trx.selectFrom('organization_settings').selectAll().where('organization_id', '=', organizationId).executeTakeFirst(),
      trx.selectFrom('locations').select(['id', 'name']).where('organization_id', '=', organizationId).orderBy('name').execute(),
    ]);

    // One scoped transaction per location, same as the owner dashboard: every
    // read still goes through RLS rather than widening a policy.
    const perLocation = await Promise.all(
      locations.map(async (location: { id: string; name: string }) => {
        const values = await runInLocationScope(this.pool, organizationId, location.id, async (scoped) => {
          const rows = await Promise.all(
            [...new Set(ORG_SETTING_FIELDS.map((f) => f.locationTable))].map(async (table) => {
              const row = await scoped
                .selectFrom(table as never)
                .selectAll()
                .where('location_id' as never, '=', location.id as never)
                .executeTakeFirst();
              return [table, row] as const;
            }),
          );
          return new Map(rows);
        });

        const settings: Record<string, unknown> = {};
        for (const field of ORG_SETTING_FIELDS) {
          const row = values.get(field.locationTable) as Record<string, unknown> | undefined;
          settings[field.key] = row ? normalize(row[field.locationColumn]) : null;
        }
        return { locationId: location.id, locationName: location.name, settings };
      }),
    );

    const defaultValues: Record<string, unknown> = {};
    for (const field of ORG_SETTING_FIELDS) {
      defaultValues[field.key] = defaults ? normalize((defaults as Record<string, unknown>)[field.orgColumn]) : null;
    }

    return {
      fields: ORG_SETTING_FIELDS,
      defaults: defaultValues,
      locations: perLocation,
    };
  }

  /**
   * Saves one field as the org default, optionally pushing it to every
   * existing shop.
   *
   * One field per call, on purpose. A whole-row save would carry along every
   * other value the form happened to be holding and silently overwrite
   * per-shop customisations that the owner never touched — which is exactly
   * what "only update the changed setting and override nothing else" rules
   * out. The update statements below name a single column for that reason.
   */
  async update(organizationId: string, key: string, rawValue: unknown, scope: ApplyScope) {
    const field = fieldByKey(key);
    if (!field) throw new BadRequestException(`Unknown setting "${key}".`);
    if (scope !== 'future' && scope !== 'all') {
      throw new BadRequestException('scope must be "future" or "all".');
    }

    const parsed = parseSettingValue(field, rawValue);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    await db()
      .insertInto('organization_settings')
      .values({ organization_id: organizationId, [field.orgColumn]: parsed.value } as never)
      .onConflict((oc: any) =>
        oc.column('organization_id').doUpdateSet({ [field.orgColumn]: parsed.value, updated_at: new Date() } as never),
      )
      .execute();

    let updatedLocations = 0;
    if (scope === 'all') {
      const locations = await db()
        .selectFrom('locations')
        .select(['id'])
        .where('organization_id', '=', organizationId)
        .execute();

      for (const location of locations) {
        await runInLocationScope(this.pool, organizationId, location.id, async (scoped) => {
          // Update, not upsert: if a shop has no row for this settings table
          // yet it is still running on the column defaults, and creating a
          // half-populated row here would freeze the rest of that table's
          // values at today's defaults — a silent override of settings the
          // owner did not ask to change.
          const result = await scoped
            .updateTable(field.locationTable as never)
            .set({ [field.locationColumn]: parsed.value, updated_at: new Date() } as never)
            .where('location_id' as never, '=', location.id as never)
            .executeTakeFirst();
          if (Number(result?.numUpdatedRows ?? 0) > 0) updatedLocations += 1;
        });
      }
    }

    return { key, value: parsed.value, scope, updatedLocations };
  }
}

/** node-postgres returns NUMERIC as a string; the UI wants a number. */
function normalize(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value ?? null;
}
