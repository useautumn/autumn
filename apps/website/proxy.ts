import { Tracker } from "@bydefault/vercel"
import { after, NextResponse, type NextRequest } from "next/server"

const tracker = new Tracker({
  token: process.env.BYDEFAULT_TOKEN as string,
  exclude: ["/api"],
})

export function proxy(request: NextRequest) {
  after(async () => {
    await tracker.track(request)
  })

  return NextResponse.next()
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|api(?:/|$)|favicon.ico|.*\\..*).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
}
