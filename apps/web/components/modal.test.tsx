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

describe('Modal — the props that replaced the hand-rolled copies', () => {
  // Each of these existed because a caller reached for a bespoke overlay
  // rather than extend this one, and each bespoke copy then dropped a
  // different mobile fix. Covered here so the shell stays worth using.

  it('offers every width the former copies hand-rolled', () => {
    const widths = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', board: 'max-w-[60rem]' } as const;
    for (const [size, expected] of Object.entries(widths)) {
      const { unmount } = render(
        <Modal onClose={vi.fn()} size={size as keyof typeof widths}>body</Modal>,
      );
      expect(screen.getByTestId('modal-panel').className).toContain(expected);
      unmount();
    }
  });

  it('drops its own padding on request, for content with full-bleed bands', () => {
    const { rerender } = render(<Modal onClose={vi.fn()}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('p-6');
    rerender(<Modal onClose={vi.fn()} padded={false}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).not.toContain('p-6');
  });

  it('keeps the safe-area padding even when unpadded — that one is not decorative', () => {
    render(<Modal onClose={vi.fn()} padded={false}>body</Modal>);
    expect(screen.getByTestId('modal-panel').className).toContain('env(safe-area-inset-bottom)');
  });

  it('ignores a backdrop tap while a submit is in flight', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal onClose={onClose} dismissible={false}>body</Modal>);
    await user.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('raises the whole backdrop when stacked, not just the panel', () => {
    // Raising only the panel leaves the second dialog behind the first's scrim.
    render(<Modal onClose={vi.fn()} elevated>body</Modal>);
    expect(screen.getByTestId('modal-backdrop').className).toContain('z-[60]');
  });
});
