import type { NextConfig } from 'next';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
      bodySizeLimit: '100mb',
    },
  },
  // Increase body size limit globally for API routes (100 MB for file uploads)
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
    responseLimit: '100mb',
  } as any,
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
