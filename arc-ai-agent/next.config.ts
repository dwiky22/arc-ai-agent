import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  env: {
    NEXT_PUBLIC_KIT_KEY: process.env.KIT_KEY,
  },
  transpilePackages: [
    "@circle-fin/app-kit",
    "@circle-fin/bridge-kit",
    "@circle-fin/swap-kit",
    "@circle-fin/adapter-viem-v2",
    "@circle-fin/adapter-ethers-v6",
  ],
};

export default nextConfig;