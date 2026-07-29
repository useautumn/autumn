import { docToMarkdown, getAgentDoc } from "@/lib/agentContent";
import { getAllPosts } from "@/lib/blogUtils";

export const dynamic = "force-static";

export function generateStaticParams() {
	return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	const doc = getAgentDoc({ kind: "blog", slug });
	if (!doc) return new Response("Not found", { status: 404 });

	return new Response(docToMarkdown(doc), {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
