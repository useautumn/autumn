import { companyPageToMarkdown, contactContent } from "@/lib/companyContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(
		companyPageToMarkdown({ content: contactContent, path: "/contact" }),
		{
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		},
	);
}
