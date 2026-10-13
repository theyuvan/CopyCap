import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// One .env at the repo root serves both the API and the web app. Next's own
// CLI already calls loadEnvConfig(frontend/) before this file loads, which
// caches an "already loaded" result with nothing in it (frontend/ has no
// .env). Without forceReload (4th arg), this call would just return that
// empty cache instead of actually reading the repo root.
nextEnv.loadEnvConfig(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  process.env.NODE_ENV !== "production",
  console,
  true,
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Optional Privy peers for Solana, Farcaster and smart-wallet features this app doesn't use.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
      "@solana-program/memo": false,
      "@abstract-foundation/agw-client": false,
      permissionless: false,
    };
    return config;
  },
};

export default nextConfig;
