import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next 16 blocks cross-origin HMR from 127.0.0.1; without this the page never hydrates there.
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    // Typechecked by `tsc --noEmit` in the build script: TS 7 native has no JS API for Next.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
