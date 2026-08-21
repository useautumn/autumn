import { buildPricingMarkdown } from "@/lib/agentContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(buildPricingMarkdown(), {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
