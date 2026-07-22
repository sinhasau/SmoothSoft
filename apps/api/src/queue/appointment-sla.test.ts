import { describe, expect, it } from 'vitest';
import { reorderForAppointmentSla } from './appointment-sla';

const now = new Date('2026-07-22T14:00:00Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe('reorderForAppointmentSla', () => {
  it('leaves order unchanged when no one is at risk', () => {
    const waiting = [
      { queueEntryId: 'a', serviceDurationMinutes: 20, present: true, apptAt: null },
      { queueEntryId: 'b', serviceDurationMinutes: 20, present: false, apptAt: null },
      { queueEntryId: 'c', serviceDurationMinutes: 20, present: true, apptAt: minutes(120) },
    ];
    const result = reorderForAppointmentSla(waiting, 10, now);
    expect(result.order).toEqual(['a', 'b', 'c']);
    expect(result.protected.size).toBe(0);
  });

  it('bumps a late appointment holder just far enough to meet the deadline', () => {
    // Three walk-ins ahead, each 30 min, would seat the appointment holder at
    // now+90min — well past their appt (now+15min) + 10min SLA.
    const waiting = [
      { queueEntryId: 'walkin-1', serviceDurationMinutes: 30, present: true, apptAt: null },
      { queueEntryId: 'walkin-2', serviceDurationMinutes: 30, present: true, apptAt: null },
      { queueEntryId: 'walkin-3', serviceDurationMinutes: 30, present: true, apptAt: null },
      { queueEntryId: 'appt', serviceDurationMinutes: 20, present: true, apptAt: minutes(15) },
    ];
    const result = reorderForAppointmentSla(waiting, 10, now);
    expect(result.protected.has('appt')).toBe(true);
    // Deadline is now+25min; only walkin-1 (30min) fits before that, so appt
    // should land right after it, not at the very front.
    expect(result.order).toEqual(['walkin-1', 'appt', 'walkin-2', 'walkin-3']);
  });

  it('resolves multiple competing appointments in apptAt order', () => {
    const waiting = [
      { queueEntryId: 'walkin', serviceDurationMinutes: 40, present: true, apptAt: null },
      { queueEntryId: 'later-appt', serviceDurationMinutes: 15, present: true, apptAt: minutes(30) },
      { queueEntryId: 'earlier-appt', serviceDurationMinutes: 15, present: true, apptAt: minutes(10) },
    ];
    const result = reorderForAppointmentSla(waiting, 10, now);
    expect(result.protected.has('earlier-appt')).toBe(true);
    expect(result.order.indexOf('earlier-appt')).toBeLessThan(result.order.indexOf('later-appt'));
  });

  it('never protects an appointment that has not arrived (present=false)', () => {
    const waiting = [
      { queueEntryId: 'walkin', serviceDurationMinutes: 60, present: true, apptAt: null },
      { queueEntryId: 'not-arrived-appt', serviceDurationMinutes: 20, present: false, apptAt: minutes(10) },
    ];
    const result = reorderForAppointmentSla(waiting, 10, now);
    expect(result.order).toEqual(['walkin', 'not-arrived-appt']);
    expect(result.protected.size).toBe(0);
  });
});
