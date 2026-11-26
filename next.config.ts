import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Typechecked by `tsc --noEmit` in the build script: TS 7 native has no JS API for Next.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
