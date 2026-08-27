/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist v5 is ESM-only — exclude from server-side bundling.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
  // Dev's persistent filesystem webpack cache lives under .next/cache — on
  // this machine (project dir under iCloud-synced Documents) writes there
  // race with the sync agent and intermittently corrupt, producing flaky
  // "class does not exist" build errors for perfectly valid Tailwind
  // classes. In-memory cache avoids the disk I/O race entirely; dev-only,
  // production builds are unaffected.
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: "memory" };
    return config;
  },
  // 30-day cutover from /cold-leads to /leads (handoff doc §11).
  async redirects() {
    return [
      { source: "/cold-leads", destination: "/leads", permanent: true },
      { source: "/cold-leads/:path*", destination: "/leads/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
