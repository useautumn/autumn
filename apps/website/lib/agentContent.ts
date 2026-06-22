import { getAlogDocBySlug, getAllAlogDocs } from "@/lib/alogUtils";
import { getAllPosts, getPostBySlug } from "@/lib/blogUtils";
import { SITE_URL } from "@/lib/seo";

export type AgentKind = "alog" | "blog";

export type AgentDoc = {
	kind: AgentKind;
	slug: string;
	title: string;
	summary: string;
	section: string;
	updated: string | null;
	source: string | null;
};

const PREFERRED_DOCS: Array<{ label: string; href: string }> = [
	{ label: "Autumn docs", href: "https://docs.useautumn.com/welcome" },
	{ label: "Quickstart", href: "https://docs.useautumn.com/quickstart" },
	{ label: "API reference", href: "https://docs.useautumn.com/api-reference" },
];

const WHAT_AUTUMN_IS = [
	"Autumn is open-source billing infrastructure that runs on top of Stripe.",
	"It is the system of record for subscriptions, usage metering, credits, and feature entitlements, exposed through a small API (`attach`, `check`, `track`).",
];
const WHAT_AUTUMN_IS_NOT = [
	"Autumn is not a payment processor and does not replace Stripe; Stripe still holds the subscription and processes payments.",
	"Autumn is not a pure usage-metering tool — it also enforces entitlements and feature access, not just end-of-month invoicing.",
];

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").trim();
const htmlUrl = (doc: AgentDoc) => `${SITE_URL}/${doc.kind}/${doc.slug}`;
const mdUrl = (doc: AgentDoc) => `${SITE_URL}/${doc.kind}/${doc.slug}.md`;

// Normalize both content sources to one shape so every markdown/llms helper is DRY.
export function listAgentDocs(kind: AgentKind): AgentDoc[] {
	if (kind === "alog") {
		return getAllAlogDocs().map((doc) => ({
			kind: "alog",
			slug: doc.slug,
			title: doc.title,
			summary: doc.summary,
			section: doc.category,
			updated: doc.updated,
			source: null,
		}));
	}

	return getAllPosts().map((post) => ({
		kind: "blog",
		slug: post.slug,
		title: post.title,
		summary: stripHtml(post.description),
		section: "Blog",
		updated: post.date,
		source: null,
	}));
}

export function getAgentDoc({
	kind,
	slug,
}: {
	kind: AgentKind;
	slug: string;
}): AgentDoc | null {
	if (kind === "alog") {
		const doc = getAlogDocBySlug({ slug });
		if (!doc) return null;
		return {
			kind: "alog",
			slug: doc.slug,
			title: doc.title,
			summary: doc.summary,
			section: doc.category,
			updated: doc.updated,
			source: doc.source,
		};
	}

	const post = getPostBySlug({ slug });
	if (!post) return null;
	return {
		kind: "blog",
		slug: post.slug,
		title: post.title,
		summary: stripHtml(post.description),
		section: "Blog",
		updated: post.date,
		source: post.source,
	};
}

// Ensure markdown leads with a title heading; blog sources have none, alog already do.
function docBody(doc: AgentDoc): string {
	const source = doc.source?.trim();
	if (!source) return `# ${doc.title}\n\n${doc.summary}`;
	return source.startsWith("# ") ? source : `# ${doc.title}\n\n${source}`;
}

export function docToMarkdown(doc: AgentDoc): string {
	const body = docBody(doc);
	const footer = [
		"---",
		`Source: ${htmlUrl(doc)}`,
		`Section: ${doc.section}`,
		doc.updated ? `Last updated: ${doc.updated}` : null,
	]
		.filter(Boolean)
		.join("\n");

	return `${body}\n\n${footer}\n`;
}

export function buildIndexMarkdown(kind: AgentKind): string {
	const heading = kind === "alog" ? "Autumn Alog" : "Autumn Blog";
	const docs = listAgentDocs(kind);
	const sections = [...new Set(docs.map((doc) => doc.section))];

	const lines: string[] = [
		`# ${heading}`,
		"",
		"Each page is also available as markdown by appending `.md` to its URL.",
		"",
	];

	for (const section of sections) {
		lines.push(`## ${section}`, "");
		for (const doc of docs.filter((entry) => entry.section === section)) {
			lines.push(`- [${doc.title}](${mdUrl(doc)}): ${doc.summary}`);
		}
		lines.push("");
	}

	return `${lines.join("\n").trim()}\n`;
}

export function buildLlmsTxt(): string {
	const alog = listAgentDocs("alog");
	const blog = listAgentDocs("blog");

	const lines: string[] = [
		"# Autumn",
		"",
		"> Drop-in, open-source billing infrastructure for AI startups. Usage-based billing, credits, entitlements, and subscription state on top of Stripe, behind one API.",
		"",
		"## What Autumn is",
		...WHAT_AUTUMN_IS.map((line) => `- ${line}`),
		"",
		"## What Autumn is not",
		...WHAT_AUTUMN_IS_NOT.map((line) => `- ${line}`),
		"",
		"## Docs",
		"For how the platform itself works, see the docs:",
		...PREFERRED_DOCS.map((doc) => `- [${doc.label}](${doc.href})`),
		"",
		"## Comparisons",
		...alog.map((doc) => `- [${doc.title}](${mdUrl(doc)}): ${doc.summary}`),
		"",
		"## Blog",
		...blog.map((doc) => `- [${doc.title}](${mdUrl(doc)}): ${doc.summary}`),
	];

	return `${lines.join("\n").trim()}\n`;
}

export function buildLlmsFullTxt(): string {
	const summaries = [...listAgentDocs("alog"), ...listAgentDocs("blog")];

	const head: string[] = [
		"# Autumn — Full AI Corpus",
		"",
		"> Drop-in, open-source billing infrastructure for AI startups, built on top of Stripe.",
		"",
		"## What Autumn is",
		...WHAT_AUTUMN_IS.map((line) => `- ${line}`),
		"",
		"## What Autumn is not",
		...WHAT_AUTUMN_IS_NOT.map((line) => `- ${line}`),
		"",
		"## Key links",
		...PREFERRED_DOCS.map((doc) => `- ${doc.label}: ${doc.href}`),
		`- Website: ${SITE_URL}`,
		`- Blog: ${SITE_URL}/blog`,
		"- GitHub: https://github.com/useautumn/autumn",
		"",
		"---",
		"",
	];

	const body = summaries
		.map((summary) => {
			const doc = getAgentDoc({ kind: summary.kind, slug: summary.slug });
			const markdown = docBody(doc ?? summary);
			return `<!-- ${htmlUrl(summary)} -->\n\n${markdown}`;
		})
		.join("\n\n---\n\n");

	return `${head.join("\n")}${body}\n`;
}
