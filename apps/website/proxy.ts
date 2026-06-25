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

async function negotiateMarkdown(
	request: NextRequest,
): Promise<NextResponse | null> {
	const markdownTarget = markdownTargetFor(request.nextUrl.pathname);
	if (!markdownTarget) return null;

	const decision = negotiate(request.headers.get("accept"));

	if (decision === "not-acceptable") {
		return new NextResponse("Not Acceptable", {
			status: 406,
			headers: { Vary: "Accept", "Content-Type": "text/plain; charset=utf-8" },
		});
	}

	if (decision === "html") {
		const response = NextResponse.next();
		response.headers.set("Vary", "Accept");
		return response;
	}

	return serveMarkdown(request, markdownTarget);
}

// Return the markdown body in this response rather than rewriting to the .md
// route: a rewrite lets the framework overwrite Vary with its own rsc value and
// drop Accept, whereas a response we own keeps a clean Vary: Accept.
async function serveMarkdown(
	request: NextRequest,
	markdownTarget: string,
): Promise<NextResponse | null> {
	const source = request.nextUrl.clone();
	source.pathname = markdownTarget;
	const upstream = await fetch(source, {
		headers: { "x-markdown-proxy": "1" },
	});
	if (!upstream.ok) return null;

	const body = await upstream.text();

	return new NextResponse(body, {
		status: 200,
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			Vary: "Accept",
		},
	});
}

export async function proxy(request: NextRequest) {
	// The internal markdown sub-request must not be tracked or re-negotiated;
	// return before track() so analytics counts the user request only once.
	if (request.headers.get("x-markdown-proxy")) {
		return NextResponse.next();
	}

	track(request);

	const negotiated = await negotiateMarkdown(request);
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
