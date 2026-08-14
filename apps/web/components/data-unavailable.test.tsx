import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataUnavailable } from './data-unavailable';

describe('DataUnavailable', () => {
  it('says loading failed, not that there is nothing here', () => {
    // The distinction this whole component exists for. An empty state means
    // "we asked and there is nothing"; it must never mean "we could not ask".
    render(<DataUnavailable what="the floor" />);
    expect(screen.getByText(/could not load the floor/i)).toBeInTheDocument();
    expect(screen.getByText(/not an empty shop/i)).toBeInTheDocument();
  });

  it('announces itself to assistive tech as an alert', () => {
    render(<DataUnavailable what="the floor" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the underlying error so the cause is not a mystery', () => {
    render(<DataUnavailable what="the floor" error={new Error('column qe.late_arrival does not exist')} />);
    expect(screen.getByTestId('data-unavailable-detail')).toHaveTextContent('column qe.late_arrival does not exist');
  });

  it('points at the most common cause, because it was the actual one', () => {
    render(<DataUnavailable what="the floor" />);
    expect(screen.getByText(/migration that has not been applied/i)).toBeInTheDocument();
  });

  it('handles a non-Error rejection without blowing up', () => {
    render(<DataUnavailable what="the floor" error="plain string failure" />);
    expect(screen.getByTestId('data-unavailable-detail')).toHaveTextContent('plain string failure');
  });

  it('omits the detail line when there is nothing useful to show', () => {
    render(<DataUnavailable what="the floor" />);
    expect(screen.queryByTestId('data-unavailable-detail')).not.toBeInTheDocument();
  });

  it('offers a retry when one is available', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<DataUnavailable what="the floor" onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('disables the retry while one is in flight', () => {
    render(<DataUnavailable what="the floor" onRetry={vi.fn()} retrying />);
    expect(screen.getByRole('button', { name: /retrying/i })).toBeDisabled();
  });

  it('shows no retry button when the caller cannot retry', () => {
    render(<DataUnavailable what="the floor" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never renders a reassuring empty-state phrase', () => {
    // Guards the regression directly: the failure mode was a screen that said
    // "No one is waiting" while the request behind it was returning 500.
    render(<DataUnavailable what="the floor" error={new Error('boom')} />);
    const text = screen.getByRole('alert').textContent ?? '';
    for (const phrase of ['No one is waiting', 'No staff clocked in', 'already clocked in']) {
      expect(text).not.toContain(phrase);
    }
  });
});
