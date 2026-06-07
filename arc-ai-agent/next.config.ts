import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  env: { NEXT_PUBLIC_KIT_KEY: process.env.KIT_KEY },
};

export default nextConfig;
