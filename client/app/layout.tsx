import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '../src/index.scss';
import '../src/tailwind.css';

export const metadata: Metadata = {
  title: 'VRMS',
  description: 'Volunteer Relationship Management System',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/logo192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/logo180.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
