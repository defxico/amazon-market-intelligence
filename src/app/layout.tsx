import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Amazon Market Intelligence',
    template: '%s | Amazon Market Intelligence',
  },
  description: 'Private, source-attributed Amazon.com search observations through REST and MCP.',
  robots: { index: false, follow: false },
  applicationName: 'Amazon Market Intelligence',
};

export const viewport: Viewport = {
  themeColor: '#101714',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
