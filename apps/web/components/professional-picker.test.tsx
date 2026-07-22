import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfessionalPicker, type ProfessionalOption } from './professional-picker';

const options: ProfessionalOption[] = [
  { locationStaffId: 'available-1', fullName: 'Camille Dupree', status: 'available', role: 'staff' },
  { locationStaffId: 'busy-1', fullName: 'Nadia Farouk', status: 'busy', role: 'staff' },
  { locationStaffId: 'off-1', fullName: 'Alex Lane', status: 'off', role: 'location_manager' },
];

describe('ProfessionalPicker', () => {
  it('prioritizes available staff and hides off staff for walk-ins', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProfessionalPicker options={options} selected="" isAppointment={false} onSelect={onSelect} />);
    expect(screen.getByRole('radio', { name: /first available/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /camille dupree/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /alex lane/i })).not.toBeInTheDocument();
    await user.click(screen.getByText(/currently busy or on break/i));
    await user.click(screen.getByRole('radio', { name: /nadia farouk/i }));
    expect(onSelect).toHaveBeenCalledWith('busy-1');
  });

  it('shows the full alphabetized team for appointments', () => {
    render(<ProfessionalPicker options={options} selected="off-1" isAppointment onSelect={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /alex lane/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/confirm availability when you book/i)).toBeInTheDocument();
  });
});
