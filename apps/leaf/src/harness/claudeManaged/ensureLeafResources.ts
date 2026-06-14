import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import { env as chatEnv } from "../../lib/env.js";
import { autumnChatInstructions } from "../common/instructions/index.js";
import { claudeManagedConfig } from "./config.js";

const isLoopback = (hostname: string) =>
	hostname === "localhost" ||
	hostname === "0.0.0.0" ||
	hostname.startsWith("127.") ||
	hostname === "::1" ||
	hostname === "[::1]";

// CMA runs in Anthropic's cloud and cannot reach a loopback host, so MCP_SERVER_URL
// must be publicly reachable. Fail fast with an actionable message instead of the
// opaque Anthropic 400 ("resolves to loopback").
const autumnMcpUrl = () => {
	const base = chatEnv.MCP_SERVER_URL;
	if (isLoopback(new URL(base).hostname)) {
		throw new Error(
			`MCP_SERVER_URL must be publicly reachable for Claude Managed Agents, but is "${base}". Point it at your public tunnel (e.g. https://j.dev.useautumn.com), which proxies /mcp to leaf.`,
		);
	}
	return new URL("/mcp", base).toString();
};

const findEnvironmentByName = async (client: Anthropic, name: string) => {
	for await (const environment of client.beta.environments.list()) {
		if (environment.name === name) return environment.id;
	}
	return undefined;
};

const findAgentByName = async (client: Anthropic, name: string) => {
	for await (const agent of client.beta.agents.list()) {
		if (agent.name === name) return agent.id;
	}
	return undefined;
};

export const buildAgentSystem = ({ docsText }: { docsText: string }) =>
	[autumnChatInstructions, docsText].filter(Boolean).join("\n\n");

// Keep the shared agent config in sync with local code/tunnel changes.
// Runs once per process, so restart is enough after prompt edits.
let agentConfigSynced = false;
const syncAgentConfig = async ({
	agentId,
	client,
	docsText,
	expectedUrl,
	logger,
}: {
	agentId: string;
	client: Anthropic;
	docsText: string;
	expectedUrl: string;
	logger: AutumnLogger;
}) => {
	if (agentConfigSynced) return;
	const agent = await client.beta.agents.retrieve(agentId);
	const expectedSystem = buildAgentSystem({ docsText });
	const currentUrl = agent.mcp_servers?.find(
		(server) => server.name === claudeManagedConfig.autumnMcpServerName,
	)?.url;
	const mcpUrlChanged = currentUrl !== expectedUrl;
	const systemChanged = agent.system !== expectedSystem;
	const modelChanged = agent.model.id !== claudeManagedConfig.model;
	if (mcpUrlChanged || systemChanged || modelChanged) {
		await client.beta.agents.update(agentId, {
			...(mcpUrlChanged
				? {
						mcp_servers: [
							{
								name: claudeManagedConfig.autumnMcpServerName,
								type: "url" as const,
								url: expectedUrl,
							},
						],
					}
				: {}),
			...(systemChanged ? { system: expectedSystem } : {}),
			...(modelChanged ? { model: claudeManagedConfig.model } : {}),
			version: agent.version,
		});
		logger.info("Refreshed Claude Managed agent config", {
			event: "leaf.claude_managed_agent_config_refreshed",
			data: {
				agent_id: agentId,
				mcp_url_changed: mcpUrlChanged,
				mcp_url_from: currentUrl,
				mcp_url_to: expectedUrl,
				system_changed: systemChanged,
				model_changed: modelChanged,
				model_from: agent.model.id,
				model_to: claudeManagedConfig.model,
			},
		});
	}
	agentConfigSynced = true;
};

// Find-or-create the ONE shared Agent + Environment, cached in-memory.
// The agent is env-agnostic; env/thread context is carried per session.
let cachedResources: { agentId: string; environmentId: string } | undefined;
export const ensureLeafResources = async ({
	client,
	env,
	logger,
	token,
}: {
	client: Anthropic;
	env: AppEnv;
	logger: AutumnLogger;
	token: string;
}): Promise<{ agentId: string; environmentId: string }> => {
	const mcpUrl = autumnMcpUrl();
	if (cachedResources && agentConfigSynced) return cachedResources;

	const { destructiveTools, docsText } = await setupAgentToolContext({
		env,
		logger,
		token,
	});

	if (cachedResources) {
		await syncAgentConfig({
			agentId: cachedResources.agentId,
			client,
			docsText,
			expectedUrl: mcpUrl,
			logger,
		});
		return cachedResources;
	}

	const environmentId =
		(await findEnvironmentByName(
			client,
			claudeManagedConfig.environmentName,
		)) ??
		(
			await client.beta.environments.create({
				config: { networking: { type: "unrestricted" }, type: "cloud" },
				name: claudeManagedConfig.environmentName,
			})
		).id;

	let agentId = await findAgentByName(client, claudeManagedConfig.agentName);
	if (agentId) {
		await syncAgentConfig({
			agentId,
			client,
			docsText,
			expectedUrl: mcpUrl,
			logger,
		});
	} else {
		const agent = await client.beta.agents.create({
			model: claudeManagedConfig.model,
			name: claudeManagedConfig.agentName,
			system: buildAgentSystem({ docsText }),
			mcp_servers: [
				{
					name: claudeManagedConfig.autumnMcpServerName,
					type: "url",
					url: mcpUrl,
				},
			],
			tools: [
				// Full sandboxed unix toolset + Autumn MCP — a real Claude Code, not locked down.
				{ type: "agent_toolset_20260401" },
				{
					default_config: { permission_policy: { type: "always_allow" } },
					mcp_server_name: claudeManagedConfig.autumnMcpServerName,
					type: "mcp_toolset",
					configs: [...destructiveTools].map((name) => ({
						name,
						permission_policy: { type: "always_ask" as const },
					})),
				},
			],
		});
		agentId = agent.id;
		agentConfigSynced = true;
		logger.info("Created shared Claude Managed agent", {
			event: "leaf.claude_managed_agent_created",
			data: { agent_id: agentId, environment_id: environmentId },
		});
	}

	cachedResources = { agentId, environmentId };
	return cachedResources;
};
