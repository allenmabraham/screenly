import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  // Browsers ignore HSTS over plain HTTP, so this is safe for local
  // development and only takes effect behind TLS in production.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Recording happens in the native apps; the web app never needs these.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Everything except the Slack unfurl player refuses to be framed. The
// /embed/v/:slug route must stay embeddable (see README, "Slack inline
// playback"), so it only receives the baseline headers above.
const frameProtectionHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Standalone output is only needed for the Docker image; platforms like
  // Vercel use their own build output. The Dockerfile sets this flag.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  // The pnpm-workspace tracing root is only correct when building inside the
  // monorepo (local dev, Docker). On Vercel it breaks file collection.
  outputFileTracingRoot:
    process.env.VERCEL === "1" ? undefined : path.join(process.cwd(), "../.."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/((?!embed/).*)",
        headers: frameProtectionHeaders,
      },
    ];
  },
};

export default nextConfig;
