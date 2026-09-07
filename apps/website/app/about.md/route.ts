import { aboutContent, companyPageToMarkdown } from "@/lib/companyContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(
		companyPageToMarkdown({ content: aboutContent, path: "/about" }),
		{
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		},
	);
}
