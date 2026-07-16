import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@exportplay/ui", "@exportplay/db", "@exportplay/domain", "@exportplay/agents", "@exportplay/workflows"],
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  experimental: { optimizePackageImports: ["lucide-react"] },
};
export default nextConfig;
