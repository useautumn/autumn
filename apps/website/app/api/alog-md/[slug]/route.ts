import { docToMarkdown, getAgentDoc } from "@/lib/agentContent";
import { getAllAlogDocs } from "@/lib/alogUtils";

export const dynamic = "force-static";

export function generateStaticParams() {
	return getAllAlogDocs().map((doc) => ({ slug: doc.slug }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	const doc = getAgentDoc({ kind: "alog", slug });
	if (!doc) return new Response("Not found", { status: 404 });

	return new Response(docToMarkdown(doc), {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
