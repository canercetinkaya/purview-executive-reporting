import type { Metadata } from 'next';
import './globals.css';
import { PortalProvider } from '@/components/PortalContext';
import { PortalShell } from '@/components/PortalShell';

export const metadata: Metadata = {
  title: 'Microsoft Purview Managed Service Executive Reporting Portal',
  description:
    'Multi-tenant executive & compliance reporting platform for Managed Microsoft Purview services.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PortalProvider>
          <PortalShell>{children}</PortalShell>
        </PortalProvider>
      </body>
    </html>
  );
}
