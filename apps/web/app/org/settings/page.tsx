'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Card, Pill } from '../../../components/ui';
import { OwnerFallback } from '../owner-fallback';
import { driftTarget, isDirty, shopsDiffering } from './setting-row-state';

interface OrgSettingField {
  key: string;
  label: string;
  group: string;
  help: string;
  type: 'boolean' | 'number' | 'enum';
  locationTable: string;
  min?: number;
  max?: number;
  options?: string[];
  unit?: string;
}

interface OrgSettingsResponse {
  fields: OrgSettingField[];
  defaults: Record<string, boolean | number | string | null>;
  locations: Array<{ locationId: string; locationName: string; settings: Record<string, boolean | number | string | null> }>;
}

type Scope = 'future' | 'all';

export default function OrgSettingsPage() {
  const dashboard = useQuery({
    queryKey: ['org', 'settings'],
    queryFn: () => api.get<OrgSettingsResponse>('/org/settings'),
  });
  const { data } = dashboard;
  if (!data) return <OwnerFallback query={dashboard} what="organization settings" />;

  const groups = Array.from(new Set(data.fields.map((f) => f.group)));

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-5 py-6 lg:px-8">
      <header className="border-b border-[#dfd9cd] pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b6f47]">Owner workspace</p>
        <h1 className="mt-1 font-serif text-4xl">Organization settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Defaults for the whole business. A new shop is created with these. Changing one here never touches
          anything else a shop has set — only the setting you change, and only if you choose to apply it.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-gray-400">
          Sales tax, store hours and payment accounts are deliberately not here: they differ per shop by nature, and
          live on each location&rsquo;s own settings page.
        </p>
      </header>

      {groups.map((group) => (
        <section key={group}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group}</h2>
          <Card>
            {data.fields.filter((f) => f.group === group).map((field, index) => (
              <SettingRow key={field.key} field={field} data={data} first={index === 0} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function SettingRow({ field, data, first }: { field: OrgSettingField; data: OrgSettingsResponse; first: boolean }) {
  const queryClient = useQueryClient();
  const orgValue = data.defaults[field.key];
  // A field with no org default still needs something in its editor, so the
  // draft is pre-filled — which means the draft alone cannot tell us whether
  // the owner changed anything. `touched` is what separates "we had to show
  // something" from "they chose this".
  //
  // Getting this wrong was not cosmetic: comparing `orgValue ?? ''` against a
  // pre-filled draft made every unset field render as an unsaved change on
  // page load, so the scope chooser was open on arrival and the first Save
  // button on the page belonged to a row nobody had touched. Saving pushed
  // that row's placeholder to every shop.
  const [draft, setDraft] = useState<boolean | number | string>(orgValue ?? defaultFor(field));
  const [touched, setTouched] = useState(false);
  const [scope, setScope] = useState<Scope>('future');

  const save = useMutation({
    mutationFn: () => api.put('/org/settings', { key: field.key, value: draft, scope }),
    onSuccess: () => {
      setTouched(false);
      return queryClient.invalidateQueries({ queryKey: ['org', 'settings'] });
    },
  });

  const dirty = isDirty(touched, orgValue, draft);
  const target = driftTarget(touched, orgValue, draft);
  const differing = shopsDiffering(data.locations, field.key, target);

  return (
    <div className={`px-4 py-4 ${first ? '' : 'border-t border-black/5'}`}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start md:gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{field.label}</strong>
            {orgValue === null && <Pill tone="amber">No org default</Pill>}
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500">{field.help}</p>
          {data.locations.length > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              {target === null
                ? `No organization default yet — each shop keeps its own: ${data.locations.map((l) => `${l.locationName} (${display(l.settings[field.key])})`).join(', ')}`
                : differing.length === 0
                  ? `All ${data.locations.length} ${data.locations.length === 1 ? 'shop' : 'shops'} already match.`
                  : `${differing.length} of ${data.locations.length} differ: ${differing.map((l) => `${l.locationName} (${display(l.settings[field.key])})`).join(', ')}`}
            </p>
          )}
        </div>

        <div className="flex min-h-11 items-center gap-2 md:justify-end">
          <Editor field={field} value={draft} onChange={(v) => { setDraft(v); setTouched(true); }} />
        </div>
      </div>

      {dirty && (
        <div className="mt-3 rounded-xl bg-stone-50 px-3 py-3">
          <fieldset>
            <legend className="text-xs font-semibold text-gray-600">Apply this change to</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name={`scope-${field.key}`} checked={scope === 'future'} onChange={() => setScope('future')} />
                Future shops only
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name={`scope-${field.key}`} checked={scope === 'all'} onChange={() => setScope('all')} />
                Future and all {data.locations.length} existing {data.locations.length === 1 ? 'shop' : 'shops'}
              </label>
              <div className="flex gap-2 sm:ml-auto">
                <button
                  type="button"
                  onClick={() => { setDraft(orgValue ?? defaultFor(field)); setTouched(false); save.reset(); }}
                  className="min-h-11 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="min-h-11 rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </fieldset>
          <p className="mt-2 text-xs text-gray-500">
            {scope === 'all'
              ? `Sets “${field.label}” on every shop. No other setting is changed.`
              : 'Existing shops keep what they have now.'}
          </p>
          {save.isError && (
            <p role="alert" className="mt-2 text-xs font-medium text-red-700">
              Could not save: {save.error instanceof Error ? save.error.message : 'unknown error'}
            </p>
          )}
        </div>
      )}
      {save.isSuccess && !dirty && <p role="status" className="mt-2 text-xs text-green-700">Saved.</p>}
    </div>
  );
}

function Editor({ field, value, onChange }: { field: OrgSettingField; value: boolean | number | string; onChange: (v: boolean | number | string) => void }) {
  if (field.type === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5" aria-label={field.label} />
        {value === true ? 'On' : 'Off'}
      </label>
    );
  }
  if (field.type === 'enum') {
    return (
      <select aria-label={field.label} value={String(value)} onChange={(e) => onChange(e.target.value)} className="min-h-11 rounded-lg border border-black/15 bg-white px-3 text-sm">
        {field.options?.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
      </select>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        aria-label={field.label}
        value={String(value)}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="min-h-11 w-28 rounded-lg border border-black/15 bg-white px-3 text-sm"
      />
      {field.unit && <span className="text-xs text-gray-500">{field.unit}</span>}
    </span>
  );
}

function defaultFor(field: OrgSettingField): boolean | number | string {
  if (field.type === 'boolean') return false;
  if (field.type === 'enum') return field.options?.[0] ?? '';
  return field.min ?? 0;
}

function display(value: boolean | number | string | null): string {
  if (value === null || value === undefined) return 'not set';
  if (value === true) return 'on';
  if (value === false) return 'off';
  return String(value);
}
