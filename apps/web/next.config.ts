import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@navo/ui", "@navo/db", "@navo/domain", "@navo/agents", "@navo/workflows"],
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: { optimizePackageImports: ["lucide-react"] },
};
export default nextConfig;
