import { buildIndexMarkdown } from "@/lib/agentContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(buildIndexMarkdown("alog"), {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
