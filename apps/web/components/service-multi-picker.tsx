'use client';

import { useState } from 'react';

export interface MultiServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
  price: string;
  /** The location's configured default service (Settings > Services) — used by callers to seed a fresh picker, not read by this component itself. */
  is_default?: boolean;
}

export function ServiceMultiPicker({
  services,
  selectedIds,
  onChange,
  helperText = 'Add only the extra services expected today so the wait estimate includes the full visit.',
}: {
  services: MultiServiceOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  helperText?: string;
}) {
  const [adding, setAdding] = useState(false);
  const selected = selectedIds.map((id) => services.find((service) => service.id === id)).filter((service): service is MultiServiceOption => Boolean(service));
  const duration = selected.reduce((sum, service) => sum + service.duration_minutes, 0);
  const price = selected.reduce((sum, service) => sum + Number(service.price), 0);

  function add(id: string) {
    if (selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setAdding(false);
  }

  function changeDefault(id: string) {
    onChange([id, ...selectedIds.filter((selectedId) => selectedId !== id && selectedId !== selectedIds[0])]);
  }

  return (
    <fieldset className="mb-4">
      <div className="mb-2 flex items-end justify-between gap-3">
        <legend className="text-sm font-semibold text-gray-800">Services</legend>
        <span className="text-xs text-gray-500">{selected.length} selected · {duration} min · ${price.toFixed(2)}</span>
      </div>
      <div className="rounded-xl border border-black/10 bg-stone-50/60 p-2">
        <label className="block rounded-lg border border-[#cddbd4] bg-white p-3 shadow-sm">
          <span className="mb-1 flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#42695d]">Default service</span><span className="text-[11px] text-gray-400">Flows through the visit</span></span>
          <select aria-label="Default service" className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 outline-none" value={selectedIds[0] ?? services[0]?.id ?? ''} onChange={(event) => changeDefault(event.target.value)}>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min · ${Number(service.price).toFixed(2)}</option>)}
          </select>
        </label>

        {selected.slice(1).map((service) => <div key={service.id} className="mt-1.5 flex items-center gap-3 rounded-lg bg-white/80 px-3 py-2.5"><span className="min-w-0 flex-1 text-sm font-medium text-gray-900">{service.name}</span><span className="shrink-0 text-xs text-gray-500">{service.duration_minutes} min · ${Number(service.price).toFixed(2)}</span><button type="button" aria-label={`Remove ${service.name}`} className="grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== service.id))}>×</button></div>)}

        <button type="button" className="mt-2 w-full rounded-lg border border-dashed border-[#8eaa9e] px-3 py-2 text-sm font-medium text-[#315f52] hover:bg-white" onClick={() => setAdding((value) => !value)}>＋ Service</button>
        {adding && <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5">{services.filter((service) => !selectedIds.includes(service.id)).map((service) => <button key={service.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-[#f3f7f4]" onClick={() => add(service.id)}><span className="text-sm font-medium">{service.name}</span><span className="text-xs text-gray-500">{service.duration_minutes} min · ${Number(service.price).toFixed(2)}</span></button>)}{services.every((service) => selectedIds.includes(service.id)) && <p className="px-2 py-2 text-xs text-gray-400">All services are already included.</p>}</div>}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{helperText}</p>
    </fieldset>
  );
}
