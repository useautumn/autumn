import { afterEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	if (originalNodeEnv === undefined) {
		delete process.env.NODE_ENV;
	} else {
		process.env.NODE_ENV = originalNodeEnv;
	}
});

const destructiveToolNames = (
	tools: Array<{ configs?: Array<{ name: string }>; type: string }>,
) =>
	(tools.find((tool) => tool.type === "mcp_toolset")?.configs ?? [])
		.map((config) => config.name)
		.sort();

describe("ensureLeafResources", () => {
	test("partitions production resources by token-derived MCP permissions", async () => {
		process.env.NODE_ENV = "production";

		const setupAgentToolContext = mock(
			async ({ token }: { token: string }) => ({
				destructiveTools: new Set(
					token === "token-a" ? ["attach"] : ["delete_customer"],
				),
			}),
		);
		const skills = [
			{
				type: "custom" as const,
				skill_id: "skill_1",
				version: "latest" as const,
			},
		];
		const ensureLeafSkills = mock(async () => skills);

		mock.module("../../../src/lib/env.js", () => ({
			env: { MCP_SERVER_URL: "https://j.dev.useautumn.com" },
		}));
		mock.module(
			"../../../src/agent/runMessage/setup/setupAgentToolContext.js",
			() => ({ setupAgentToolContext }),
		);
		mock.module("../../../src/harness/claudeManaged/skills.js", () => ({
			ensureLeafSkills,
			skillsMatch: (
				current: Array<{ skill_id?: string | null }> | undefined,
				desired: typeof skills,
			) => {
				const currentIds = new Set(
					(current ?? [])
						.map((skill) => skill.skill_id)
						.filter((id): id is string => Boolean(id)),
				);
				return (
					desired.length === currentIds.size &&
					desired.every((ref) => currentIds.has(ref.skill_id))
				);
			},
		}));

		const { ensureLeafResources } = await import(
			`../../../src/harness/claudeManaged/ensureLeafResources.js?cache-test=${Date.now()}`
		);

		let storedAgent:
			| {
					id: string;
					mcp_servers: unknown;
					model: { id: string };
					name: string;
					skills: typeof skills;
					system: string;
					tools: Array<{ configs?: Array<{ name: string }>; type: string }>;
					version: number;
			  }
			| undefined;
		const updates: unknown[] = [];
		const client = {
			beta: {
				agents: {
					create: async (params: {
						mcp_servers: unknown;
						model: string;
						name: string;
						skills: typeof skills;
						system: string;
						tools: Array<{
							configs?: Array<{ name: string }>;
							type: string;
						}>;
					}) => {
						storedAgent = {
							...params,
							id: "agent_1",
							model: { id: params.model },
							version: 1,
						};
						return { id: storedAgent.id };
					},
					list: async function* () {
						if (storedAgent) yield storedAgent;
					},
					retrieve: async () => {
						if (!storedAgent) throw new Error("Agent was not created");
						return storedAgent;
					},
					update: async (
						_id: string,
						params: {
							mcp_servers?: unknown;
							model?: string;
							skills?: typeof skills;
							system?: string;
							tools?: Array<{
								configs?: Array<{ name: string }>;
								type: string;
							}>;
							version: number;
						},
					) => {
						if (!storedAgent) throw new Error("Agent was not created");
						updates.push(params);
						storedAgent = {
							...storedAgent,
							...params,
							mcp_servers: params.mcp_servers ?? storedAgent.mcp_servers,
							model: { id: params.model ?? storedAgent.model.id },
							skills: params.skills ?? storedAgent.skills,
							system: params.system ?? storedAgent.system,
							tools: params.tools ?? storedAgent.tools,
							version: storedAgent.version + 1,
						};
						return storedAgent;
					},
				},
				environments: {
					create: async () => ({ id: "env_1" }),
					list: async function* () {},
				},
			},
		};

		const logger = { info: () => {} };
		const first = await ensureLeafResources({
			client: client as never,
			env: AppEnv.Sandbox,
			logger: logger as never,
			surface: "slack",
			token: "token-a",
		});
		const second = await ensureLeafResources({
			client: client as never,
			env: AppEnv.Sandbox,
			logger: logger as never,
			surface: "slack",
			token: "token-b",
		});
		const firstAgain = await ensureLeafResources({
			client: client as never,
			env: AppEnv.Sandbox,
			logger: logger as never,
			surface: "slack",
			token: "token-a",
		});

		// token-a is fetched once and served from the short-TTL cache on the
		// third call, so only the two distinct tokens hit the round trip.
		expect(setupAgentToolContext).toHaveBeenCalledTimes(2);
		expect(destructiveToolNames(first.tools)).toEqual(["attach"]);
		expect(destructiveToolNames(second.tools)).toEqual(["delete_customer"]);
		expect(destructiveToolNames(firstAgain.tools)).toEqual(["attach"]);
		expect(updates).toHaveLength(2);
		expect(
			destructiveToolNames(
				(updates[0] as { tools: typeof second.tools }).tools,
			),
		).toEqual(["delete_customer"]);
		expect(
			destructiveToolNames((updates[1] as { tools: typeof first.tools }).tools),
		).toEqual(["attach"]);
		expect(ensureLeafSkills).toHaveBeenCalledTimes(3);
	});
});
