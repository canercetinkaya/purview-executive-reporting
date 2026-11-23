import type { NextConfig } from 'next';

const apiTarget = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:4010';

const nextConfig: NextConfig = {
  transpilePackages: ['@purview-portal/domain'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiTarget}/api/v1/:path*`,
      },
      {
        source: '/health',
        destination: `${apiTarget}/health`,
      },
    ];
  },
};

export default nextConfig;
