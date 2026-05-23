/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @resvg/resvg-js ships native .node binaries (one per platform) that
    // webpack can't bundle. Leaving it external keeps the require() at runtime.
    serverComponentsExternalPackages: ['@resvg/resvg-js'],
  },

  // Phase 5 URL migration: old paths permanent-redirect to /app/*. Keep these
  // for at least 30 days so bookmarks and external links keep working.
  async redirects() {
    const moved = [
      'matches',
      'roster',
      'import',
      'settings',
      'analytics',
      'trends',
      'calendar',
      'me',
      'team',
      'opponents',
      'players',
      'prep',
      'select-team',
    ]
    return moved.flatMap((p) => [
      { source: `/${p}`, destination: `/app/${p}`, permanent: true },
      { source: `/${p}/:path*`, destination: `/app/${p}/:path*`, permanent: true },
    ])
  },
}

export default nextConfig
