import { SITE_URL } from "@/lib/seo";

export type CompanyPageLink = { label: string; href: string };

export type CompanyPageContent = {
	title: string;
	intro: string;
	sections: Array<{
		title: string;
		content: string;
		links?: CompanyPageLink[];
	}>;
};

export const aboutContent: CompanyPageContent = {
	title: "About Autumn",
	intro:
		"Autumn is open-source billing infrastructure for software companies. It gives product teams one place to define pricing, manage subscription state, meter usage, track credits, and enforce feature access while Stripe continues to process payments.",
	sections: [
		{
			title: "Why we built it",
			content:
				"Billing logic spreads quickly. A new plan can require application flags, usage counters, Stripe products, checkout code, webhook handlers, and migration scripts. Autumn moves those decisions into a versioned catalog and a small API so a team can change pricing without rebuilding the same system for every product or contract.",
		},
		{
			title: "What we operate",
			content:
				"Autumn maintains the billing and entitlement state around Stripe. Developers can attach plans, check access, track usage, issue credits, model prepaid and pay-as-you-go pricing, and keep customer state synchronized through the API, SDKs, CLI, dashboard, webhooks, and hosted MCP server.",
		},
		{
			title: "Company",
			content:
				"Autumn is operated by Rebase, Inc., a Delaware corporation. The source code is available on GitHub, the API and product documentation are public, and the team works directly with developers building billing for AI and usage-based software products.",
			links: [
				{ label: "GitHub", href: "https://github.com/useautumn/autumn" },
				{ label: "Documentation", href: "https://docs.useautumn.com/welcome" },
			],
		},
	],
};

export const contactContent: CompanyPageContent = {
	title: "Contact Autumn",
	intro:
		"Talk to the Autumn team about product questions, implementation help, security, privacy, or a billing architecture you are planning. The links below are the official contact paths for Rebase, Inc. (doing business as Autumn).",
	sections: [
		{
			title: "Product and sales",
			content:
				"Email hey@useautumn.com for product questions, pricing, migration planning, enterprise requirements, or help deciding whether Autumn fits your billing model. Include your current stack, the pricing model you want to support, and whether you already use Stripe so the team can give you a concrete answer.",
			links: [
				{ label: "Email the team", href: "mailto:hey@useautumn.com" },
				{ label: "Book a demo", href: "https://cal.com/ayrod" },
			],
		},
		{
			title: "Support and community",
			content:
				"For implementation questions, start with the documentation or ask in the Autumn Discord community. Public GitHub issues are the right place for reproducible bugs and feature requests that do not contain customer data, credentials, or other sensitive information.",
			links: [
				{ label: "Documentation", href: "https://docs.useautumn.com/welcome" },
				{ label: "Discord", href: "https://discord.com/invite/STqxY92zuS" },
				{
					label: "GitHub issues",
					href: "https://github.com/useautumn/autumn/issues",
				},
			],
		},
		{
			title: "Security and privacy",
			content:
				"Email security@useautumn.com for security reports, privacy requests, or questions about how Autumn handles personal information. Do not include live secret keys or payment details in an initial message. Autumn's legal entity is Rebase, Inc., a Delaware corporation in the United States.",
			links: [
				{ label: "Security email", href: "mailto:security@useautumn.com" },
				{ label: "Privacy policy", href: "/privacy" },
			],
		},
	],
};

export const developersContent: CompanyPageContent = {
	title: "Autumn Developer Resources",
	intro:
		"Build and automate usage-based billing with Autumn's public API, SDKs, OpenAPI schema, OAuth 2.0 authorization server, CLI, webhooks, and hosted MCP server. These are the canonical resources for application code, scripts, CI jobs, and AI agents.",
	sections: [
		{
			title: "API and schemas",
			content:
				"The Autumn REST API exposes typed operations for customers, plans, features, balances, billing, events, referrals, and more. The OpenAPI 3.1 specification gives every operation a unique operation ID, description, request schema, and response schema so clients and function-calling agents can generate reliable calls.",
			links: [
				{
					label: "API reference",
					href: "https://docs.useautumn.com/api-reference",
				},
				{ label: "OpenAPI specification", href: "/openapi.yml" },
				{
					label: "OAuth metadata",
					href: "/.well-known/oauth-authorization-server",
				},
			],
		},
		{
			title: "SDKs and CLI",
			content:
				"Use the official SDKs in application code. For local development and automation, install the atmn CLI from npm or run it with npx. The CLI can initialize a versioned autumn.config.ts file, preview and push catalog changes, pull remote state, inspect customers and events, and emit JSON in headless environments.",
			links: [
				{ label: "Quickstart", href: "https://docs.useautumn.com/quickstart" },
				{ label: "atmn on npm", href: "https://www.npmjs.com/package/atmn" },
				{
					label: "CLI source",
					href: "https://github.com/useautumn/autumn/tree/dev/packages/atmn",
				},
			],
		},
		{
			title: "Agents and webhooks",
			content:
				"Connect an agent to the hosted Streamable HTTP MCP server to inspect catalog and customer state or perform typed billing actions after OAuth authorization. Use webhooks for event-driven application updates. Agents should preview destructive billing or catalog changes before applying them.",
			links: [
				{
					label: "MCP documentation",
					href: "https://docs.useautumn.com/documentation/mcp",
				},
				{
					label: "MCP server card",
					href: "https://mcp.useautumn.com/.well-known/mcp/server-card.json",
				},
				{
					label: "Webhook documentation",
					href: "https://docs.useautumn.com/documentation/webhooks",
				},
			],
		},
	],
};

export function companyPageToMarkdown({
	content,
	path,
}: {
	content: CompanyPageContent;
	path: string;
}) {
	const sections = content.sections.flatMap((section) => [
		`## ${section.title}`,
		"",
		section.content,
		...(section.links?.map((link) => `- [${link.label}](${link.href})`) ?? []),
		"",
	]);

	return [
		`# ${content.title}`,
		"",
		content.intro,
		"",
		...sections,
		"---",
		`Source: ${SITE_URL}${path}`,
		"",
	].join("\n");
}
