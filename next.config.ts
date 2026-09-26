import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // A stray lockfile in the user's home directory (outside this repo) makes
  // Next.js misdetect the workspace root. Pin it explicitly to this project.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
