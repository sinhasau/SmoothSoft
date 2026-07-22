import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaffOnboardingForm } from './staff-onboarding-form';

describe('StaffOnboardingForm', () => {
  it('submits identity, recurring days, pay, and credential data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StaffOnboardingForm pending={false} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Full name'), 'Taylor Reed');
    await user.type(screen.getByLabelText('Phone'), '3135551212');
    await user.click(screen.getByLabelText('Mon'));
    await user.type(screen.getByLabelText(/license or credential/i), 'Barber license');
    await user.click(screen.getByRole('button', { name: /create team member/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Taylor Reed', phone: '313-555-1212', commissionPct: 50, schedule: [expect.objectContaining({ dayOfWeek: 1 })] }));
  });

  it('supports cancel and close actions', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<StaffOnboardingForm pending={false} onCancel={onCancel} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /close onboarding form/i }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
