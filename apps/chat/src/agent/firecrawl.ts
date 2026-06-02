import { createTool } from "@mastra/core/tools";
import Firecrawl from "@mendable/firecrawl-js";
import { z } from "zod";

type FirecrawlClient = {
	search: (
		query: string,
		options?: { limit?: number; sources?: ["web"] },
	) => Promise<{ web?: unknown[] }>;
	scrape: (
		url: string,
		options?: { formats?: ["markdown"] },
	) => Promise<{
		markdown?: string;
		metadata?: { title?: string; sourceURL?: string };
	}>;
};

const maxSearchResults = 5;
const maxMarkdownLength = 12_000;

const trimMarkdown = (markdown = "") =>
	markdown
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.slice(0, maxMarkdownLength);

const stringField = (value: unknown, field: string) =>
	value && typeof value === "object"
		? (value as Record<string, unknown>)[field]
		: undefined;

export const createFirecrawlTools = ({
	apiKey,
	client,
	onAction,
}: {
	apiKey: string;
	client?: FirecrawlClient;
	onAction?: (message: string) => Promise<void> | void;
}): Record<string, ReturnType<typeof createTool>> => {
	const firecrawl = client ?? new Firecrawl({ apiKey });

	return {
		searchWeb: createTool({
			id: "searchWeb",
			description:
				"Search the public web for current or external information. Use Autumn MCP tools instead for Autumn customer, plan, billing, balance, or schedule data.",
			inputSchema: z
				.object({
					query: z.string().min(1),
					limit: z.number().int().positive().max(maxSearchResults).optional(),
				})
				.strict(),
			execute: async ({ query, limit = maxSearchResults }) => {
				await onAction?.("Searching web");
				const results = await firecrawl.search(query, {
					limit,
					sources: ["web"],
				});
				return {
					results: (results.web ?? []).slice(0, limit).map((result) => ({
						title:
							stringField(result, "title") ??
							stringField(result, "url") ??
							"Untitled",
						url: stringField(result, "url"),
						description: stringField(result, "description"),
					})),
				};
			},
		}),
		scrapeUrl: createTool({
			id: "scrapeUrl",
			description:
				"Read one public web page as markdown after searchWeb identifies a relevant URL.",
			inputSchema: z.object({ url: z.url() }).strict(),
			execute: async ({ url }) => {
				await onAction?.("Reading page");
				const page = await firecrawl.scrape(url, { formats: ["markdown"] });
				return {
					title: page.metadata?.title,
					url: page.metadata?.sourceURL ?? url,
					markdown: trimMarkdown(page.markdown),
				};
			},
		}),
	};
};
