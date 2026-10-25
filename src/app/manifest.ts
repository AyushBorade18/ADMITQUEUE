import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'AdmitQueue - CAP admission manager',
    short_name: 'AdmitQueue',
    description: 'Track your CAP admission, preferences and documents. Needs an internet connection for your records.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f2f5f9',
    theme_color: '#0f5c78',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard' },
      { name: 'Preferences', url: '/preferences' },
      { name: 'Documents', url: '/checklist' },
    ],
  };
}
