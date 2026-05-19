/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @resvg/resvg-js ships native .node binaries (one per platform) that
    // webpack can't bundle. Leaving it external keeps the require() at runtime.
    serverComponentsExternalPackages: ['@resvg/resvg-js'],
  },
};

export default nextConfig;
