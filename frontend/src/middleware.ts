import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { AppEnv } from "@autumn/shared";

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

  if (!sessionClaims?.org_id && !req.nextUrl.pathname.includes("/onboarding")) {
    console.log("Redirecting to onboarding");
    const onboardingUrl = new URL("/onboarding", req.url);
    return NextResponse.redirect(onboardingUrl);
  }

  if (sessionClaims?.org_id && req.nextUrl.pathname.includes("/onboarding")) {
    const url = new URL("/", req.url);
    console.log("Redirecting to home");
    return NextResponse.redirect(url);
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

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  requestHeaders.set("env", AppEnv.Live);

  return NextResponse.next({
    headers: requestHeaders,
  });
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

// Export another middleware for /api routes?
export const autumnMiddleware = async (req: NextRequest) => {
  console.log("API middleware");

  const data = await req.json();

  if (!data.product_id || !data.customer_id) {
    return NextResponse.json(
      {
        error: "Missing product_id or customer_id",
      },
      {
        status: 400,
      }
    );
  }

  const autumnApiKey = process.env.AUTUMN_API_KEY;

  const response = await fetch("http://localhost:8080/v1/attach", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${autumnApiKey}`,
    },
  });

  const result = await response.json();
  return NextResponse.json(result);
  // if (req.method == "POST") {
  //   const body = await req.json();
  //   console.log(body);

  //   return NextResponse.json({
  //     message: "API middleware",
  //   });
  // } else {
  //   return NextResponse.json(
  //     {
  //       error: "Method not allowed",
  //     },
  //     {
  //       status: 405,
  //     }
  //   );
  // }
};
