import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/student.css';
import '@/styles/app.css';
import { PwaStatus } from '@/components/PwaStatus';

export const metadata: Metadata = {
  title: { default: 'AdmitQueue - CAP admission manager', template: '%s - AdmitQueue' },
  description: 'Keep your CAP admission details, preferences and document checklist in one place.',
  applicationName: 'AdmitQueue',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'AdmitQueue', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0f5c78',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <PwaStatus />
      </body>
    </html>
  );
}
