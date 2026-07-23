import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: "next-build-v6",
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;
