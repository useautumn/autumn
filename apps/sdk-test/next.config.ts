import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["autumn-js"],
  turbopack: {
    resolveAlias: {
      "@useautumn/sdk": path.resolve(
        import.meta.dirname,
        "../../packages/sdk/dist/esm/index.js",
      ),
    },
  },
};

export default nextConfig;
