import type { NextConfig } from "next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Static export only for production build (bundled into Tauri .app).
  // In dev mode, Next needs absolute asset paths for HMR + hydration to work.
  ...(isProd
    ? { output: "export" as const, trailingSlash: true, assetPrefix: "./" }
    : {}),
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
