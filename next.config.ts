import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  images: {
    qualities: [100, 75],
  },
  // Supplementary guard for this memory-constrained machine (7.5GB RAM,
  // Committed_AS near its limit with browser/IDE running): caps build-time
  // page-data workers at 2 to reduce peak memory. NOTE: this is NOT the fix
  // for the "Bus error (core dumped)" build crash — that was a truncated
  // next-swc native binary (see git history). This only makes builds more
  // reliable on low-memory hosts; it intentionally slows builds everywhere.
  experimental: {
    cpus: 2,
  },
  // Pin the workspace root to THIS project. Without it, Next.js may detect
  // a stray lockfile in a parent directory (e.g. ~/package-lock.json) and
  // infer the wrong root, which nests the standalone output under an extra
  // path (e.g. .next/standalone/Desktop/kivo/server.js instead of
  // .next/standalone/server.js), breaking the start script and packaging.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
