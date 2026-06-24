/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  // El frontend llama a /api/... (mismo origen) y Next lo proxya al backend
  // Express. Así el navegador nunca habla con api.anthropic.com (CLAUDE.md).
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
