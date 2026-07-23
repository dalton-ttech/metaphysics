import type { NextConfig } from "next";

const isCloudflarePages = process.env.CF_PAGES === "1";

const nextConfig: NextConfig = {
  distDir: isCloudflarePages ? "next-build-pages" : "next-build-v6",
  output: isCloudflarePages ? "export" : "standalone",
  trailingSlash: isCloudflarePages,
  poweredByHeader: false,
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;
