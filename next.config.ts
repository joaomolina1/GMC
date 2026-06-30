import type { NextConfig } from "next";
import {
  SUPABASE_ANON_KEY_FALLBACK,
  SUPABASE_PROJECT_URL,
} from "./lib/supabase/constants";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  SUPABASE_PROJECT_URL;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  SUPABASE_ANON_KEY_FALLBACK;

const nextConfig: NextConfig = {
  // Inline at build time so Edge Middleware receives values even when Vercel env
  // vars were not configured before the first deploy.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  },
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
