import type { NextConfig } from 'next';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');


const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/whatsapp/webhook',
        destination: '/api/webhooks/whatsapp',
      },
    ];
  },
};

export default nextConfig;
