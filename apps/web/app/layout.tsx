import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '../lib/providers';
import './globals.css';

// Matches the reference mockups' clean grotesque look — loaded via
// next/font so it's self-hosted, applied globally, and never FOUTs.
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: "JJ's Barbers — Salon Platform",
  description: 'Live queue, scheduling, and shop management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
