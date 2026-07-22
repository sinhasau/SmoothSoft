'use client';

export interface ProfessionalOption {
  locationStaffId: string;
  fullName: string;
  status: 'available' | 'busy' | 'break' | 'off';
  role: string;
}

const STATUS_COPY = {
  available: { label: 'Available now', dot: 'bg-green-500' },
  busy: { label: 'With a client', dot: 'bg-blue-500' },
  break: { label: 'On break', dot: 'bg-amber-500' },
  off: { label: 'Not clocked in', dot: 'bg-gray-300' },
} as const;

function PersonButton({ person, selected, showStatus, onSelect }: { person: ProfessionalOption; selected: boolean; showStatus: boolean; onSelect: (id: string) => void }) {
  const status = STATUS_COPY[person.status];
  return <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(person.locationStaffId)} className={`min-w-0 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-black bg-black text-white shadow-sm' : 'border-black/10 bg-white hover:border-black/30 hover:bg-stone-50'}`}>
    <strong className="block truncate text-sm font-medium">{person.fullName}</strong>
    <span className={`mt-1 flex items-center gap-1.5 text-xs ${selected ? 'text-white/65' : 'text-gray-500'}`}>{showStatus && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />}{showStatus ? status.label : person.role.replace(/_/g, ' ')}</span>
  </button>;
}

export function ProfessionalPicker({ options, selected, isAppointment, onSelect }: { options: ProfessionalOption[]; selected: string; isAppointment: boolean; onSelect: (id: string) => void }) {
  const alphabetized = [...options].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const available = alphabetized.filter((person) => person.status === 'available');
  const waiting = alphabetized.filter((person) => person.status === 'busy' || person.status === 'break');
  const appointmentOptions = alphabetized;
  return <fieldset className="mb-4" role="radiogroup" aria-label="Professional preference">
    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Professional preference</legend>
    <button type="button" role="radio" aria-checked={selected === ''} onClick={() => onSelect('')} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${selected === '' ? 'border-black bg-black text-white shadow-sm' : 'border-black/10 bg-stone-50 hover:border-black/30'}`}>
      <span><strong className="block text-sm font-medium">First available</strong><span className={`mt-0.5 block text-xs ${selected === '' ? 'text-white/65' : 'text-gray-500'}`}>{isAppointment ? 'We’ll match the best available professional.' : 'Usually the shortest wait.'}</span></span>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${selected === '' ? 'bg-white/15 text-white' : 'bg-green-50 text-green-700'}`}>Recommended</span>
    </button>

    {isAppointment ? <div className="mt-3"><p className="mb-2 text-xs text-gray-500">Request a specific professional <span className="text-gray-400">· We’ll confirm availability when you book</span></p><div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">{appointmentOptions.map((person) => <PersonButton key={person.locationStaffId} person={person} selected={selected === person.locationStaffId} showStatus={false} onSelect={onSelect} />)}</div></div> : <>
      {available.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-medium text-gray-500">Available now</p><div className="grid grid-cols-2 gap-2">{available.map((person) => <PersonButton key={person.locationStaffId} person={person} selected={selected === person.locationStaffId} showStatus onSelect={onSelect} />)}</div></div>}
      {waiting.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-gray-500">Currently busy or on break ({waiting.length})</summary><div className="mt-2 grid grid-cols-2 gap-2">{waiting.map((person) => <PersonButton key={person.locationStaffId} person={person} selected={selected === person.locationStaffId} showStatus onSelect={onSelect} />)}</div></details>}
      {available.length === 0 && waiting.length === 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No professionals are clocked in. Clock someone in before assigning this walk-in.</p>}
    </>}
  </fieldset>;
}
