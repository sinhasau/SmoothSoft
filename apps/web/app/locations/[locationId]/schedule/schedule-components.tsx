'use client';

import { Button } from '../../../../components/ui';

export function isUndoShortcut(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>) {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
}

export function staffingCoverageLabel(scheduled: number, minimum: number) {
  if (scheduled < minimum) return `${scheduled} staff scheduled · minimum target ${minimum}`;
  return `${scheduled} staff scheduled`;
}

export function ScheduleUndoButton({ pending, onUndo }: { pending: boolean; onUndo: () => void }) {
  return <Button onClick={onUndo} disabled={pending}>Undo <span className="ml-1 text-xs opacity-50">Ctrl Z</span></Button>;
}

export interface ShiftMenuState {
  staffId: string;
  fullName: string;
  date: string;
  entry?: { working: boolean };
  x: number;
  y: number;
}

export function ShiftContextMenu({ state, copied, onClose, onEdit, onDuplicate, onCopy, onPaste, onDelete }: { state: ShiftMenuState; copied: boolean; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onCopy: () => void; onPaste: () => void; onDelete: () => void }) {
  const hasShift = !!state.entry?.working;
  return <><button className="schedule-context-scrim" aria-label="Close shift actions" onClick={onClose} /><div className="schedule-context-menu" role="menu" aria-label={`Actions for ${state.fullName} on ${state.date}`} style={{ left: Math.min(state.x, window.innerWidth - 210), top: Math.min(state.y, window.innerHeight - 290) }}>
    <span className="schedule-context-heading">{state.fullName}<small>{state.date}</small></span>
    <button role="menuitem" onClick={onEdit}>{hasShift ? 'Edit shift' : 'Create shift'} <kbd>Enter</kbd></button>
    {hasShift && <button role="menuitem" onClick={onDuplicate}>Duplicate to next day</button>}
    {hasShift && <button role="menuitem" onClick={onCopy}>Copy shift</button>}
    <button role="menuitem" onClick={onPaste} disabled={!copied}>Paste shift here</button>
    {hasShift && <button role="menuitem" className="danger" onClick={onDelete}>Remove shift <kbd>Del</kbd></button>}
  </div></>;
}

export function PublishReview({ dirtyCount, issueCount, activeCount, notifyScope, published, onNotifyScope, onClose, onPublish, pending }: { dirtyCount: number; issueCount: number; activeCount: number; notifyScope: 'all' | 'affected'; published: boolean; onNotifyScope: (scope: 'all' | 'affected') => void; onClose: () => void; onPublish: () => void; pending: boolean }) {
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="schedule-drawer" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="publish-title">
    <div className="drawer-heading"><div><span className="eyebrow">Final review</span><h2 id="publish-title">Publish this schedule</h2></div><button className="schedule-icon-button" onClick={onClose} aria-label="Close publish review">×</button></div>
    <div className="drawer-form">
      <p className="text-sm leading-6 text-gray-600">Review the impact before making this week available to the team.</p>
      <div className="publish-review-summary"><div><strong>{dirtyCount}</strong><span>unpublished change{dirtyCount === 1 ? '' : 's'}</span></div><div className={issueCount ? 'warning' : ''}><strong>{issueCount}</strong><span>issue{issueCount === 1 ? '' : 's'} to review</span></div><div><strong>{activeCount}</strong><span>active team members</span></div></div>
      {issueCount > 0 && <div className="validation-box"><strong>Publishing with attention items</strong><span>The schedule can still be published, but managers should review the highlighted staffing, capacity, and overtime issues.</span></div>}
      <fieldset className="publish-options"><legend>Employee notifications</legend><label><input type="radio" name="notify" checked={notifyScope === 'all'} onChange={() => onNotifyScope('all')} /><span><strong>Notify everyone</strong><small>Best for the initial weekly schedule.</small></span></label><label><input type="radio" name="notify" checked={notifyScope === 'affected'} onChange={() => onNotifyScope('affected')} /><span><strong>Only affected employees</strong><small>Best when republishing a small update.</small></span></label></fieldset>
      {published && <p className="rounded-lg bg-stone-50 p-3 text-xs text-gray-600">The team will see this version. Earlier published versions remain in the history.</p>}
    </div>
    <div className="drawer-footer"><Button onClick={onClose}>Keep editing</Button><Button variant="solid" onClick={onPublish} disabled={pending}>{pending ? 'Publishing…' : issueCount ? `Publish with ${issueCount} issues` : 'Publish schedule'}</Button></div>
  </aside></div>;
}
