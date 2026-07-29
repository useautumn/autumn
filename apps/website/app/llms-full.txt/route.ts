import { buildLlmsFullTxt } from "@/lib/agentContent";

export const dynamic = "force-static";

export function GET() {
	return new Response(buildLlmsFullTxt(), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
