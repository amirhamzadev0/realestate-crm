import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": ["./.private/**/*", "./.env*", "./.tmp/**/*", "./tests/**/*"],
  },
};

export default nextConfig;
