import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClinicFlow EMR & Patient Ledger',
    short_name: 'ClinicFlow',
    description: 'Clinical Patient Management & Electronic Medical Records (EMR) Platform.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f172a', // Slate 900
    theme_color: '#6366f1',      // Indigo 500
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/favicon.ico',
        sizes: '192x192',
        type: 'image/x-icon',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: '512x512',
        type: 'image/x-icon',
        purpose: 'maskable',
      },
    ],
  }
}
