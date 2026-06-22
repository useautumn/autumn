import { Tracker } from "@bydefault/vercel";
import { after, NextResponse, type NextRequest } from "next/server";
import { negotiate } from "@/lib/contentNegotiation";
import { markdownTargetFor } from "@/lib/markdownRoutes";

// Bydefault tracking is disabled when no token is set (e.g. local dev), so the
// proxy is a no-op instead of throwing at module load.
const token = process.env.BYDEFAULT_TOKEN;
const tracker = token ? new Tracker({ token, exclude: ["/api"] }) : null;

function track(request: NextRequest) {
  if (tracker) {
    after(async () => {
      await tracker.track(request);
    });
  }
}

function negotiateMarkdown(request: NextRequest): NextResponse | null {
  const markdownTarget = markdownTargetFor(request.nextUrl.pathname);
  if (!markdownTarget) return null;

  const decision = negotiate(request.headers.get("accept"));

  if (decision === "not-acceptable") {
    return new NextResponse("Not Acceptable", {
      status: 406,
      headers: { Vary: "Accept", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (decision === "markdown") {
    const url = request.nextUrl.clone();
    url.pathname = markdownTarget;
    const response = NextResponse.rewrite(url);
    response.headers.set("Vary", "Accept");
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("Vary", "Accept");
  return response;
}

export function proxy(request: NextRequest) {
  track(request);

  const negotiated = negotiateMarkdown(request);
  if (negotiated) return negotiated;

  return NextResponse.next();
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
};
