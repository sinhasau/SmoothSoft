import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

describe('Modal — reachability of the panel bottom on mobile', () => {
  // jsdom does not lay out, so these assert the CSS contract that makes the
  // submit button reachable. The bug they guard: a walk-in check-in whose
  // "Check in" button sat below the phone viewport with no way to scroll to it.

  it('lets the backdrop scroll, so an over-tall panel is never stranded', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    expect(screen.getByTestId('modal-backdrop').className).toContain('overflow-y-auto');
  });

  it('lets the panel scroll its own content', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('overflow-y-auto');
  });

  it('sizes the panel in dvh, never vh — vh ignores mobile browser chrome', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    const className = screen.getByTestId('modal-panel').className;
    expect(className).toContain('dvh');
    expect(className).not.toMatch(/\d+vh/);
  });

  it('leaves room for the top offset in the panel height, so the two cannot sum past the screen', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    // Mobile: full height minus the backdrop's own py-4 (1rem top + 1rem bottom).
    expect(screen.getByTestId('modal-panel').className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('pads the panel bottom past the iOS home indicator', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps the large top offset only from the sm breakpoint up', () => {
    render(<Modal onClose={vi.fn()}>body</Modal>);
    const className = screen.getByTestId('modal-backdrop').className;
    expect(className).toContain('sm:pt-24');
    // The unprefixed padding must stay small — an unconditional pt-24 is the bug.
    expect(className).not.toMatch(/(^|\s)pt-24/);
  });
});

describe('Modal — behavior', () => {
  it('renders its children', () => {
    render(<Modal onClose={vi.fn()}>hello</Modal>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('closes when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose}>body</Modal>);
    await user.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when the panel itself is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose}><button type="button">Check in</button></Modal>);
    await user.click(screen.getByRole('button', { name: 'Check in' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('exposes itself as a labelled dialog to assistive tech', () => {
    render(<Modal onClose={vi.fn()} label="Walk-in check-in">body</Modal>);
    expect(screen.getByRole('dialog', { name: 'Walk-in check-in' })).toBeInTheDocument();
  });

  it('widens for the wide variant', () => {
    const { rerender } = render(<Modal onClose={vi.fn()}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('max-w-md');
    rerender(<Modal onClose={vi.fn()} wide>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('max-w-2xl');
  });
});
