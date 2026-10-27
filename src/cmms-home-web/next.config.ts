import type { NextConfig } from 'next'
import withPWA from '@ducanh2912/next-pwa'

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {},
  // Legacy QR labels encode /storage/{box|shelf}/{id}; boxes and shelves are now
  // unified StorageLocations keyed by the same id.
  async redirects() {
    return [{ source: '/storage/:type/:id', destination: '/storage/:id', permanent: false }]
  },
}

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  // Keep the rest of next-pwa's defaults (fonts, images, pages…) and replace only the
  // entry we care about; the plugin matches overrides by cacheName.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        // next-pwa's default caches every same-origin /api GET NetworkFirst into "apis",
        // which means an authorised response sits on the device and can be replayed offline
        // after sign-out — for whoever holds the phone next. Never cache them: the API is
        // the authority on what this session may see. Same cacheName so the default is
        // dropped rather than merely shadowed.
        urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
        method: 'GET',
        options: { cacheName: 'apis' },
      },
    ],
  },
})(nextConfig)
