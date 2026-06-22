import { Tracker } from "@bydefault/vercel"
import { after, NextResponse, type NextRequest } from "next/server"

// Bydefault tracking is disabled when no token is set (e.g. local dev), so the
// proxy is a no-op instead of throwing at module load.
const token = process.env.BYDEFAULT_TOKEN
const tracker = token ? new Tracker({ token, exclude: ["/api"] }) : null

export function proxy(request: NextRequest) {
  if (tracker) {
    after(async () => {
      await tracker.track(request)
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|api(?:/|$)|favicon.ico|.*\\..*).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
    // AI/agent text routes are dotted paths excluded above; track them explicitly.
    { source: "/llms.txt" },
    { source: "/llms-full.txt" },
    { source: "/alog.md" },
    { source: "/alog/:path*.md" },
    { source: "/blog.md" },
    { source: "/blog/:path*.md" },
  ],
}
