import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";
process.env.FIRECRAWL_API_KEY ??= "fc_test";

const { leafSystemPrompt, leafSkills } = await import(
	"@autumn/agent-docs/agent"
);
const autumnChatInstructions = leafSystemPrompt("slack");
const { getDefaultChatEnv, selectChatEnv } = await import(
	"../../../src/agent/runMessage/setup/selectChatEnv.js"
);
const { selectChatOrg } = await import(
	"../../../src/agent/runMessage/setup/selectChatOrg.js"
);
const {
	orgIdentifierVariants,
	shouldUseSlackAdminInstallationForWorkspace,
	validateSlackAdminAccessConfig,
} = await import("../../../src/internal/slackAdmin/access.js");
const { createFirecrawlTools } = await import(
	"../../../src/agent/tools/firecrawl.js"
);
const { isCmaVaultStale } = await import(
	"../../../src/harness/claudeManaged/vaults/ensureAutumnVault.js"
);
const { buildAgentSystem, syncClaudeManagedSessionAgentConfig } = await import(
	"../../../src/harness/claudeManaged/ensureLeafResources.js"
);
const { buildDesiredTools } = await import(
	"../../../src/harness/claudeManaged/toolset.js"
);
const { containsInternalToolCall } = await import(
	"../../../src/harness/common/output.js"
);

const execute = async (
	tool: { execute?: (...args: never[]) => Promise<unknown> } | undefined,
	input: unknown,
) => {
	if (!tool?.execute) throw new Error("Tool is not executable");
	return tool.execute(input as never, {} as never);
};

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
});

describe("chat environment selection", () => {
	test("exposes the leaf knowledge skills", () => {
		expect(leafSkills.map((skill) => skill.name).sort()).toEqual([
			"autumn-billing",
			"autumn-catalog",
			"autumn-concepts",
			"autumn-investigate",
		]);
	});

	test("includes the Autumn rules in the managed agent prompt", () => {
		expect(autumnChatInstructions).toContain(
			"Use Autumn MCP tools for Autumn customer",
		);
		expect(autumnChatInstructions).toContain(
			"If the relevant Autumn skill is loaded",
		);
	});

	test("uses bullets for multiple required items", () => {
		expect(autumnChatInstructions).toContain(
			"One fact answers in one short sentence",
		);
		expect(autumnChatInstructions).toContain("goes in bullets");
		expect(autumnChatInstructions).toContain("Ask one direct question");
		expect(autumnChatInstructions).toContain(
			"do not expose internal modelling",
		);
	});

	test("points billing actions to the Billing MCP resource", () => {
		expect(autumnChatInstructions).toContain("autumn://docs/billing");
	});

	test("points the dashboard to the catalog knowledge", () => {
		expect(leafSystemPrompt("dashboard")).toContain("autumn-catalog");
	});

	test("detects raw tool-call markup before posting output", () => {
		expect(
			containsInternalToolCall(
				'<tool_call>\n{"name":"listCustomers","arguments":{}}\n</tool_call>',
			),
		).toBe(true);
		expect(containsInternalToolCall("Here are the customers.")).toBe(false);
	});

	test("defaults to sandbox outside production", () => {
		delete process.env.NODE_ENV;
		expect(getDefaultChatEnv()).toBe(AppEnv.Sandbox);

		process.env.NODE_ENV = "development";
		expect(getDefaultChatEnv()).toBe(AppEnv.Sandbox);
	});

	test("defaults to live in production", () => {
		process.env.NODE_ENV = "production";
		expect(getDefaultChatEnv()).toBe(AppEnv.Live);
	});

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

	test("extracts an explicit org identifier from structured model output", async () => {
		await expect(
			selectChatOrg({
				message: "for org acme-prod, list customers",
				select: () => ({ org_identifier: "acme-prod" }),
			}),
		).resolves.toBe("acme-prod");
	});

	test("allows missing org identifier from structured model output", async () => {
		await expect(
			selectChatOrg({
				message: "list customers",
				select: () => ({ org_identifier: null }),
			}),
		).resolves.toBeNull();
	});

	test("rejects malformed org selector output", async () => {
		await expect(
			selectChatOrg({
				message: "for org acme-prod",
				select: () => ({ org_identifier: 42 }),
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

describe("Slack admin access gate", () => {
	test("builds flexible org identifier variants", () => {
		expect(
			orgIdentifierVariants({
				identifier: "unit test org",
			}),
		).toContain("unit-test-org");
		expect(
			orgIdentifierVariants({
				identifier: "Unit_Test Org!",
			}),
		).toContain("unit-test-org");
	});

	test("allows the configured admin workspace", () => {
		expect(
			validateSlackAdminAccessConfig({
				configuredWorkspaceId: "T_ADMIN",
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: true });
	});

	test("fails closed without a workspace config", () => {
		expect(
			validateSlackAdminAccessConfig({
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: false, reason: "admin_config_missing" });
		expect(
			validateSlackAdminAccessConfig({
				workspaceId: "T_ADMIN",
			}),
		).toEqual({ allowed: false, reason: "admin_config_missing" });
	});

	test("denies the wrong workspace", () => {
		expect(
			validateSlackAdminAccessConfig({
				configuredWorkspaceId: "T_ADMIN",
				workspaceId: "T_OTHER",
			}),
		).toEqual({ allowed: false, reason: "wrong_workspace" });
	});

	test("only checks the admin install for the configured admin workspace", () => {
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				configuredWorkspaceId: "T_ADMIN",
				isProduction: true,
				workspaceId: "T_ADMIN",
			}),
		).toBe(true);
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				configuredWorkspaceId: "T_ADMIN",
				isProduction: true,
				workspaceId: "T_CUSTOMER",
			}),
		).toBe(false);
	});

	test("does not check admin installs without workspace config", () => {
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				isProduction: true,
				workspaceId: "T_ADMIN",
			}),
		).toBe(false);
		expect(
			shouldUseSlackAdminInstallationForWorkspace({
				isProduction: false,
				workspaceId: "T_ADMIN",
			}),
		).toBe(false);
	});
});

describe("Claude Managed vault sync", () => {
	test("builds managed agent system from current Autumn instructions", () => {
		const system = buildAgentSystem({ surface: "slack" });

		expect(system).toContain("One fact answers in one short sentence");
		expect(system).toContain("goes in bullets");
		expect(system).toContain("Use Autumn MCP tools for Autumn customer");
		expect(system).toContain("Preview before every write.");
		// The slack surface points at the billing knowledge.
		expect(system).toContain("autumn-billing");
	});

	test("refreshes stale session MCP permissions", async () => {
		const mcpServers = [
			{
				name: "autumn" as const,
				type: "url" as const,
				url: "https://j.dev.useautumn.com/mcp",
			},
		];
		const tools = buildDesiredTools({ destructiveTools: ["attach"] });
		const staleTools = tools.map((tool) =>
			tool.type === "mcp_toolset"
				? {
						...tool,
						default_config: {
							enabled: false,
							permission_policy: { type: "always_allow" as const },
						},
					}
				: tool,
		);
		const updates: unknown[] = [];
		const client = {
			beta: {
				sessions: {
					retrieve: async () => ({
						agent: { mcp_servers: mcpServers, tools: staleTools },
					}),
					update: async (_sessionId: string, params: unknown) => {
						updates.push(params);
						return {};
					},
				},
			},
		} as never;

		await syncClaudeManagedSessionAgentConfig({
			client,
			env: AppEnv.Sandbox,
			logger: { info: () => {} } as never,
			orgId: "org_1",
			resources: {
				agentId: "agent_1",
				environmentId: "env_1",
				mcpServers,
				tools,
			},
			sessionId: "session_1",
		});

		expect(updates).toEqual([{ agent: { tools } }]);
	});

	test("skips the session retrieve when resources are unchanged", async () => {
		const mcpServers = [
			{
				name: "autumn" as const,
				type: "url" as const,
				url: "https://j.dev.useautumn.com/mcp",
			},
		];
		const tools = buildDesiredTools({ destructiveTools: ["attach"] });
		let retrieves = 0;
		const client = {
			beta: {
				sessions: {
					retrieve: async () => {
						retrieves += 1;
						return { agent: { mcp_servers: mcpServers, tools } };
					},
					update: async () => ({}),
				},
			},
		} as never;
		const args = {
			client,
			env: AppEnv.Sandbox,
			logger: { info: () => {} } as never,
			orgId: "org_1",
			resources: {
				agentId: "agent_2",
				environmentId: "env_2",
				mcpServers,
				tools,
			},
			sessionId: "session_unchanged",
		};

		await syncClaudeManagedSessionAgentConfig(args);
		await syncClaudeManagedSessionAgentConfig(args);

		expect(retrieves).toBe(1);
	});

	test("treats the vault as stale when local OAuth credentials are newer", () => {
		expect(
			isCmaVaultStale({
				credentialUpdatedAt: 2000,
				currentMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				storedMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				vaultUpdatedAt: 1000,
			}),
		).toBe(true);
		expect(
			isCmaVaultStale({
				credentialUpdatedAt: 1000,
				currentMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				storedMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				vaultUpdatedAt: 2000,
			}),
		).toBe(false);
		expect(
			isCmaVaultStale({
				credentialUpdatedAt: 1000,
				currentMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				storedMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				vaultUpdatedAt: null,
			}),
		).toBe(true);
		expect(
			isCmaVaultStale({
				credentialUpdatedAt: 1000,
				currentMcpServerUrl: "https://j.dev.useautumn.com/mcp",
				storedMcpServerUrl: "https://old.dev.useautumn.com/mcp",
				vaultUpdatedAt: 2000,
			}),
		).toBe(true);
	});
});
