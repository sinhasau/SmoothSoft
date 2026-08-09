import type { Metadata, Viewport } from 'next';
import { Providers } from '../lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: "JJ's Barbers — Salon Platform",
  description: 'Live queue, scheduling, and shop management',
};

/**
 * `viewportFit: 'cover'` is the load-bearing part, and its absence was a silent
 * bug rather than a missing nicety. Next injects `width=device-width,
 * initial-scale=1` by default, but WITHOUT `viewport-fit=cover` every
 * `env(safe-area-inset-*)` resolves to 0 on iOS.
 *
 * So the modal's `pb-[max(1.5rem,env(safe-area-inset-bottom))]` — written
 * specifically to keep a submit button clear of the iPhone home indicator —
 * was picking the 1.5rem fallback on every device, and the last ~34px of every
 * dialog sat underneath the indicator. Nothing looked wrong in the CSS, which
 * is why it survived a round of "fix the modal on mobile".
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
