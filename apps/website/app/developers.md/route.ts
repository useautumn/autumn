import { companyPageToMarkdown, developersContent } from "@/lib/companyContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(
		companyPageToMarkdown({ content: developersContent, path: "/developers" }),
		{
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		},
	);
}
