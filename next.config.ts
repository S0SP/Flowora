import type { NextConfig } from 'next';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        // Add your Vercel production domain below (without https://)
        // e.g. 'flowra.yourdomain.com' or 'your-project.vercel.app'
        process.env.NEXT_PUBLIC_APP_URL?.replace('https://', '').replace('http://', '') ?? '',
      ].filter(Boolean),
      bodySizeLimit: '100mb',
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
