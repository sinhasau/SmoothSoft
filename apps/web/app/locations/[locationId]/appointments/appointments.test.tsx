import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentSection } from './appointment-section';

const appointment = {
  id: 'appt-1', clientId: 'client-1', clientName: 'Jordan Lee', startsAt: '2026-07-22T14:00:00Z', status: 'confirmed' as const,
  notes: null, source: 'public_booking', staffName: 'Nadia', primaryService: 'Haircut',
};

describe('appointment actions', () => {
  it('checks an arrived appointment into the Floor', () => {
    const onCheckIn = vi.fn();
    render(<AppointmentSection title="Today" rows={[appointment]} locationId="location-1" canCancel pending={false} onCheckIn={onCheckIn} onCancel={() => undefined} onNoShow={() => undefined} onReschedule={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onCheckIn).toHaveBeenCalledWith('appt-1');
  });

  it('offers cancellation only to authorized roles', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<AppointmentSection title="Coming up" rows={[appointment]} locationId="location-1" canCancel pending={false} onCheckIn={() => undefined} onCancel={onCancel} onNoShow={() => undefined} onReschedule={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledWith('appt-1');
    rerender(<AppointmentSection title="Coming up" rows={[appointment]} locationId="location-1" canCancel={false} pending={false} onCheckIn={() => undefined} onCancel={onCancel} onNoShow={() => undefined} onReschedule={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
