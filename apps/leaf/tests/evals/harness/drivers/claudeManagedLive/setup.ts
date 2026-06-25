import type Anthropic from "@anthropic-ai/sdk";
import { leafSkillsText, leafSystemPrompt } from "@autumn/agent-docs/agent";
import type { AppEnv } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { claudeManagedConfig } from "../../../../../src/harness/claudeManaged/config.js";
import type { EvalDriverMessage } from "../types.js";

// Read tool defs (for the always_ask destructive set) from the LOCAL mock — the
// eval process reaches localhost directly, no tunnel needed.
export const loadMcpMetadata = async ({ url }: { url: URL }) => {
	const mcpClient = new MCPClient({
		id: `cma-live-eval-${crypto.randomUUID()}`,
		servers: { autumn: { url } },
	});
	try {
		const { toolsets, errors } = await mcpClient.listToolsetsWithErrors();
		if (Object.keys(errors).length) {
			throw new Error(`MCP tool discovery failed: ${JSON.stringify(errors)}`);
		}
		const tools = (toolsets.autumn ?? {}) as Record<
			string,
			{ mcp?: { annotations?: { destructiveHint?: boolean } } }
		>;
		const destructiveTools = new Set(
			Object.entries(tools)
				.filter(([, tool]) => tool.mcp?.annotations?.destructiveHint === true)
				.map(([name]) => name),
		);
		return { destructiveTools };
	} finally {
		await mcpClient.disconnect();
	}
};

const ensureEvalEnvironment = async (client: Anthropic) => {
	for await (const environment of client.beta.environments.list()) {
		if (environment.name === "leaf-eval") return environment.id;
	}
	const created = await client.beta.environments.create({
		config: { networking: { type: "unrestricted" }, type: "cloud" },
		name: "leaf-eval",
	});
	return created.id;
};

const buildAgentConfig = ({
	destructiveTools,
	env,
	mcpUrl,
	model,
	today,
}: {
	destructiveTools: Set<string>;
	env: AppEnv;
	mcpUrl: string;
	model: string;
	today?: Date;
}) => ({
	model: model.replace(/^anthropic\//, ""),
	name: "Autumn Leaf (eval)",
	system: [
		leafSystemPrompt("slack"),
		`Current Autumn environment: ${env}.`,
		today ? `Current date: ${today.toISOString()}.` : null,
		leafSkillsText(),
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n"),
	mcp_servers: [
		{
			name: claudeManagedConfig.autumnMcpServerName,
			type: "url" as const,
			url: mcpUrl,
		},
	],
	tools: [
		{ type: "agent_toolset_20260401" as const },
		{
			default_config: { permission_policy: { type: "always_allow" as const } },
			mcp_server_name: claudeManagedConfig.autumnMcpServerName,
			type: "mcp_toolset" as const,
			configs: [...destructiveTools].map((name) => ({
				name,
				permission_policy: { type: "always_ask" as const },
			})),
		},
	],
});

// Reuse ONE shared eval agent (update it so the tunnel URL + config stay current)
// rather than creating a new agent per run.
// Memoized per process so concurrent eval cases share ONE agent setup — the
// find-or-update is otherwise racy under parallelism (all list → find none → all
// create → duplicate agents). Across processes, the find-by-name reuses the existing
// "Autumn Leaf (eval)" agent (updating it to a new version, not creating another).
let evalAgentPromise:
	| Promise<{ agentId: string; environmentId: string }>
	| undefined;

export const ensureEvalAgent = async ({
	client,
	...config
}: {
	client: Anthropic;
	destructiveTools: Set<string>;
	env: AppEnv;
	mcpUrl: string;
	model: string;
	today?: Date;
}) => {
	evalAgentPromise ??= (async () => {
		const agentConfig = buildAgentConfig(config);
		const environmentId = await ensureEvalEnvironment(client);

		let existing: { id: string; version: number } | undefined;
		for await (const agent of client.beta.agents.list()) {
			if (agent.name === agentConfig.name) {
				existing = { id: agent.id, version: agent.version };
				break;
			}
		}
		const agent = existing
			? await client.beta.agents.update(existing.id, {
					...agentConfig,
					version: existing.version,
				})
			: await client.beta.agents.create(agentConfig);

		return { agentId: agent.id, environmentId };
	})();
	return evalAgentPromise;
};

export const toMessage = (input: EvalDriverMessage) => {
	if (typeof input === "string") return { attachments: [], text: input };
	const attachments: { data: Buffer; mimeType: string; name?: string }[] = [];
	const texts: string[] = [];
	for (const item of input as Array<{ content: unknown }>) {
		if (typeof item.content === "string") {
			texts.push(item.content);
			continue;
		}
		if (!Array.isArray(item.content)) continue;
		for (const part of item.content as Array<{
			data?: Buffer;
			filename?: string;
			mediaType?: string;
			text?: string;
			type: string;
		}>) {
			if (part.type === "text" && part.text) texts.push(part.text);
			if (part.type === "file" && part.data && part.mediaType) {
				attachments.push({
					data: part.data,
					mimeType: part.mediaType,
					name: part.filename,
				});
			}
		}
	}
	return { attachments, text: texts.join("\n\n") };
};
