import { type NextRequest, NextResponse } from "next/server";

export const config = {
	matcher: ["/", "/blog", "/blog/:path*", "/privacy"],
};

export function middleware(req: NextRequest) {
	const accept = req.headers.get("accept") ?? "";
	if (!prefersMarkdown(accept)) return NextResponse.next();

	const url = req.nextUrl.clone();
	const pathname = url.pathname.replace(/\/$/, "") || "/";

	let mdPath: string;
	if (pathname === "/") {
		mdPath = "/_md/index.md";
	} else if (pathname === "/blog") {
		mdPath = "/_md/blog/index.md";
	} else {
		mdPath = `/_md${pathname}.md`;
	}

	url.pathname = mdPath;

	const res = NextResponse.rewrite(url);
	res.headers.set("Content-Type", "text/markdown; charset=utf-8");
	res.headers.set("Vary", "Accept");
	return res;
}

function prefersMarkdown(accept: string): boolean {
	const entries = accept
		.split(",")
		.map((raw) => {
			const [type, ...params] = raw.trim().split(";");
			const qParam = params.find((p) => p.trim().startsWith("q="));
			const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
			return { type: type.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
		})
		.filter((e) => e.type);

	const md = entries.find((e) => e.type === "text/markdown");
	if (!md || md.q <= 0) return false;

	const html = entries.find((e) => e.type === "text/html");
	return !html || md.q >= html.q;
}
