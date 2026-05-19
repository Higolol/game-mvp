import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zboparcletaettrhjzyw.supabase.co',
      },
    ],
  },
};

export default nextConfig;
