import { AppEnv } from "@autumn/shared";
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";
process.env.FIRECRAWL_API_KEY ??= "fc_test";

const { selectChatEnv } = await import("../../../src/agent/agent.js");
const { createFirecrawlTools } = await import("../../../src/agent/firecrawl.js");

const execute = async (
	tool: { execute?: (...args: never[]) => Promise<unknown> } | undefined,
	input: unknown,
) => {
	if (!tool?.execute) throw new Error("Tool is not executable");
	return tool.execute(input as never, {} as never);
};

describe("chat environment selection", () => {
	test("uses live from structured model output", async () => {
		await expect(
			selectChatEnv({
				message: "list customers",
				select: () => ({ env: AppEnv.Live }),
			}),
		).resolves.toBe(AppEnv.Live);
	});

	test("uses sandbox from structured model output", async () => {
		await expect(
			selectChatEnv({
				message: "try this in the sandbox first",
				select: () => ({ env: AppEnv.Sandbox }),
			}),
		).resolves.toBe(AppEnv.Sandbox);
	});

	test("rejects malformed model output", async () => {
		await expect(
			selectChatEnv({
				message: "test mode",
				select: () => ({ env: "test" }),
			}),
		).rejects.toThrow();
	});
});

describe("Firecrawl tools", () => {
	test("registers search and scrape tools", () => {
		const tools = createFirecrawlTools({
			apiKey: "fc_test",
			client: {
				search: async () => ({ web: [] }),
				scrape: async () => ({}),
			},
		});

		expect(Object.keys(tools).sort()).toEqual(["scrapeUrl", "searchWeb"]);
	});

	test("maps search results into compact output", async () => {
		const tools = createFirecrawlTools({
			apiKey: "fc_test",
			client: {
				search: async (query, options) => {
					expect(query).toBe("autumn billing docs");
					expect(options).toEqual({ limit: 2, sources: ["web"] });
					return {
						web: [
							{
								title: "Autumn Docs",
								url: "https://docs.useautumn.com",
								description: "Billing docs",
							},
						],
					};
				},
				scrape: async () => ({}),
			},
		});

		await expect(
			execute(tools.searchWeb, { query: "autumn billing docs", limit: 2 }),
		).resolves.toEqual({
			results: [
				{
					title: "Autumn Docs",
					url: "https://docs.useautumn.com",
					description: "Billing docs",
				},
			],
		});
	});

	test("scrapes one URL and bounds returned markdown", async () => {
		const tools = createFirecrawlTools({
			apiKey: "fc_test",
			client: {
				search: async () => ({ web: [] }),
				scrape: async (url, options) => {
					expect(url).toBe("https://example.com");
					expect(options).toEqual({ formats: ["markdown"] });
					return {
						markdown: `${"a".repeat(13_000)}\n\n\nextra`,
						metadata: {
							title: "Example",
							sourceURL: "https://example.com",
						},
					};
				},
			},
		});

		const result = await execute(tools.scrapeUrl, {
			url: "https://example.com",
		});

		expect(result).toMatchObject({
			title: "Example",
			url: "https://example.com",
		});
		expect((result as { markdown: string }).markdown.length).toBe(12_000);
	});
});
