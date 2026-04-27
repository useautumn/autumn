import createMDX from "@next/mdx";

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  allowedDevOrigins: ["*.ngrok-free.dev"],
  experimental: {
    optimizePackageImports: ["framer-motion", "motion", "gsap", "@gsap/react"],
    optimizeCss: true,
  },
  images: {
    // Serve AVIF to supporting browsers (better compression than WebP),
    // falling back to WebP. Next.js negotiates via Accept header automatically.
   // formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      // Next.js chunks include a content hash in their filename, so they are
      // safe to cache indefinitely. Vercel sets this automatically on its CDN,
      // but the explicit header also covers self-hosted deployments.
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Lottie JSON files are large (1.4–2.6 MB each) and change infrequently.
      // A 1-year cache means repeat visitors skip the expensive re-download.
      {
        source: "/animation/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Public images: 7-day TTL with a 1-day stale-while-revalidate window
      // so content updates eventually propagate without blocking visitors.
      {
        source: "/images/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "media-src 'self'",
              "connect-src 'self' https://*.vercel.app https://vitals.vercel-insights.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
