import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceMultiPicker } from './service-multi-picker';

const services = [
  { id: 'cut', name: 'Haircut', duration_minutes: 30, price: '30.00' },
  { id: 'beard', name: 'Beard trim', duration_minutes: 15, price: '15.00' },
];

describe('ServiceMultiPicker', () => {
  it('adds another service and displays the combined visit estimate', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ServiceMultiPicker services={services} selectedIds={['cut']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /service/i }));
    await user.click(screen.getByRole('button', { name: /beard trim/i }));
    expect(onChange).toHaveBeenCalledWith(['cut', 'beard']);
    rerender(<ServiceMultiPicker services={services} selectedIds={['cut', 'beard']} onChange={onChange} />);
    expect(screen.getByText(/2 selected · 45 min · \$45\.00/i)).toBeInTheDocument();
  });

  it('keeps one default service while allowing extras to be removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ServiceMultiPicker services={services} selectedIds={['cut', 'beard']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /remove beard trim/i }));
    expect(onChange).toHaveBeenCalledWith(['cut']);
    expect(screen.getByRole('combobox', { name: /default service/i })).toHaveValue('cut');
  });
});
