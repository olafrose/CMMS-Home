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
})(nextConfig)
