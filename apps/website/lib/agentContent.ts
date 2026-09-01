import { getAllAlogDocs, getAlogDocBySlug } from "@/lib/alogUtils";
import { getAllPosts, getPostBySlug } from "@/lib/blogUtils";
import {
	PRIVACY_EFFECTIVE_DATE,
	privacyPolicySections,
} from "@/lib/privacyPolicyContent";
import { SITE_URL } from "@/lib/seo";
import { TERMS_EFFECTIVE_DATE, termsSections } from "@/lib/termsContent";

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
	{ label: "OpenAPI specification", href: `${SITE_URL}/openapi.yml` },
	{
		label: "OAuth 2.0 metadata",
		href: `${SITE_URL}/.well-known/oauth-authorization-server`,
	},
	{ label: "MCP server", href: "https://mcp.useautumn.com/mcp" },
	{
		label: "MCP server card",
		href: "https://mcp.useautumn.com/.well-known/mcp/server-card.json",
	},
	{ label: "Autumn CLI on npm", href: "https://www.npmjs.com/package/atmn" },
];

const WHAT_AUTUMN_IS = [
	"Autumn is open-source billing infrastructure that runs on top of Stripe.",
	"It is the system of record for subscriptions, usage metering, credits, and feature entitlements, exposed through a small API (`attach`, `check`, `track`).",
];
const WHAT_AUTUMN_IS_NOT = [
	"Autumn is not a payment processor and does not replace Stripe; Stripe still holds the subscription and processes payments.",
	"Autumn is not a pure usage-metering tool — it also enforces entitlements and feature access, not just end-of-month invoicing.",
];
const WHEN_TO_USE_AUTUMN = [
	"Use Autumn when a software product needs subscriptions, usage-based pricing, prepaid credits, feature access, or a mix of those models on top of Stripe.",
	"Use Autumn when pricing needs to live in versioned configuration instead of being duplicated across application code, Stripe objects, and webhook handlers.",
	"Use Autumn when an agent needs to inspect or change a billing catalog, query customers and balances, preview a billing action, or reconcile subscription state through typed tools.",
	"Do not use Autumn as a payment processor. Keep Stripe as the processor and source of payment details; Autumn coordinates the billing and entitlement state around it.",
];
const CORE_WORKFLOWS = [
	"Define plans and features in the dashboard or in `autumn.config.ts`, then use the `atmn` CLI to preview and push the catalog.",
	"Call `attach` when a customer starts, changes, or purchases a plan. Autumn creates or updates the corresponding Stripe resources and subscription state.",
	"Call `check` before a gated action to read feature access or the remaining balance. Call `track` after usage so metered balances, credits, and overage billing stay synchronized.",
	"Use the REST API or official TypeScript, Python, React, and framework SDKs for application code. Use the hosted MCP server for agent workflows that need typed discovery and actions.",
];
const AGENT_WORKFLOWS = [
	"To answer a billing-state question, fetch the customer and relevant plan or balance first. Report the current subscription, entitlement, remaining balance, reset time, and any scheduled change instead of inferring state from Stripe objects alone.",
	"To change a catalog, inspect the existing features and plans, build the complete desired update, and preview it before applying it. Treat migrations and destructive catalog writes as approval-gated actions.",
	"To change a customer's billing, identify the customer and plan, preview the attach, update, cancellation, or one-off charge, explain immediate and next-cycle effects, and apply only after the user confirms the priced action.",
	"For dates, use epoch milliseconds at the API boundary. For money, send major currency units such as 49 for $49; Autumn converts amounts only when it reaches a processor boundary that requires minor units.",
	"For automation, prefer the typed OpenAPI schema, the headless `atmn` CLI, or the hosted MCP tools over scraping the dashboard. Authenticate application calls with an Autumn secret key and interactive agent connections with OAuth 2.0.",
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
		"## When to use Autumn",
		...WHEN_TO_USE_AUTUMN.map((line) => `- ${line}`),
		"",
		"## Core workflow",
		...CORE_WORKFLOWS.map((line) => `- ${line}`),
		"",
		"## Agent workflow",
		...AGENT_WORKFLOWS.map((line) => `- ${line}`),
		"",
		"## Docs",
		"For product guidance, schemas, authentication, agent tools, and the CLI:",
		...PREFERRED_DOCS.map((doc) => `- [${doc.label}](${doc.href})`),
		"",
		"## CLI",
		"The official CLI is the [`atmn` package](https://www.npmjs.com/package/atmn). Run `npx atmn init`, `npx atmn pull`, or `npx atmn push --yes` for non-interactive agent and CI workflows.",
		"",
		"## Comparisons",
		...alog.map((doc) => `- [${doc.title}](${mdUrl(doc)}): ${doc.summary}`),
		"",
		"## Blog",
		...blog.map((doc) => `- [${doc.title}](${mdUrl(doc)}): ${doc.summary}`),
	];

	return `${lines.join("\n").trim()}\n`;
}

export function buildHomeMarkdown(): string {
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
		"## When to use Autumn",
		...WHEN_TO_USE_AUTUMN.map((line) => `- ${line}`),
		"",
		"## Core workflow",
		...CORE_WORKFLOWS.map((line) => `- ${line}`),
		"",
		"## Agent workflow",
		...AGENT_WORKFLOWS.map((line) => `- ${line}`),
		"",
		"## Learn more",
		...PREFERRED_DOCS.map((doc) => `- [${doc.label}](${doc.href})`),
		`- [Developer resources](${SITE_URL}/developers)`,
		`- [About Autumn](${SITE_URL}/about)`,
		`- [Contact Autumn](${SITE_URL}/contact)`,
		`- [Blog](${SITE_URL}/blog)`,
		`- [Comparisons](${SITE_URL}/alog)`,
		"- [GitHub](https://github.com/useautumn/autumn)",
		"",
		"---",
		`Source: ${SITE_URL}/`,
	];

	return `${lines.join("\n").trim()}\n`;
}

export function buildPricingMarkdown(): string {
	return [
		"# Autumn Pricing",
		"",
		"Start free with 8K monthly billing volume. Pro starts at $375 per month for teams scaling usage-based pricing, with volume pricing available.",
		"",
		"- [View pricing](https://useautumn.com/pricing)",
		"- [Contact Autumn](https://useautumn.com/contact)",
		"",
	].join("\n");
}

export function buildTermsMarkdown(): string {
	const lines: string[] = [
		"# Terms of Service",
		"",
		`Autumn (Rebase, Inc.) — Effective Date: ${TERMS_EFFECTIVE_DATE}`,
		"",
	];

	for (const term of termsSections) {
		lines.push(`## ${term.title}`, "", term.content, "");
	}

	lines.push("---", `Source: ${SITE_URL}/terms`);

	return `${lines.join("\n").trim()}\n`;
}

export function buildPrivacyMarkdown(): string {
	const lines: string[] = [
		"# Privacy Policy",
		"",
		`Autumn (Rebase, Inc.) — Effective Date: ${PRIVACY_EFFECTIVE_DATE}`,
		"",
	];

	for (const section of privacyPolicySections) {
		lines.push(`## ${section.title}`, "", section.content, "");
	}

	lines.push("---", `Source: ${SITE_URL}/privacy`);

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
		"## When to use Autumn",
		...WHEN_TO_USE_AUTUMN.map((line) => `- ${line}`),
		"",
		"## Core workflow",
		...CORE_WORKFLOWS.map((line) => `- ${line}`),
		"",
		"## Agent workflow",
		...AGENT_WORKFLOWS.map((line) => `- ${line}`),
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
