import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wnhojvxnamxmpmdislcl.supabase.co",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
