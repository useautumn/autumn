import {
  clerkMiddleware,
  createRouteMatcher,
  getAuth,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AppEnv } from "@autumn/shared";
import { autumnMiddleware } from "@useautumn/react/server";

const isProtectedRoute = createRouteMatcher(["/", "/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Create middleware
  if (req.nextUrl.pathname == "/api/autumn") return await autumnMiddleware(req);

  const path = req.nextUrl.pathname;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("path", path);
  requestHeaders.set("origin", req.nextUrl.origin);

  // Check for session claims
  const { sessionClaims }: { sessionClaims: any } = await auth();

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  if (!sessionClaims?.org_id && !req.nextUrl.pathname.includes("/onboarding")) {
    const onboardingUrl = new URL("/sandbox/onboarding", req.url);
    if (req.nextUrl.pathname !== "/") {
      onboardingUrl.searchParams.set(
        "toast",
        "Please create an organization to continue"
      );
    }
    return NextResponse.redirect(onboardingUrl);
  }

  if (path === "/") {
    return NextResponse.redirect(new URL("/customers", req.url));
  } else if (path === "/sandbox") {
    return NextResponse.redirect(new URL("/sandbox/customers", req.url));
  }

  if (path.startsWith("/sandbox")) {
    const newPath = path.replace("/sandbox", "");
    requestHeaders.set("env", AppEnv.Sandbox);
    return NextResponse.rewrite(new URL(newPath, req.url), {
      headers: requestHeaders,
    });
  }

  requestHeaders.set("env", AppEnv.Live);

  return NextResponse.next({
    headers: requestHeaders,
  });
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
