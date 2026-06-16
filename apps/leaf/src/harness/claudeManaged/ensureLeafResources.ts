import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import { env as chatEnv } from "../../lib/env.js";
import { autumnChatInstructions } from "../common/instructions/index.js";
import { claudeManagedConfig } from "./config.js";
import {
	buildDesiredTools,
	builtinSignatureFromToolset,
	desiredBuiltinSignature,
} from "./toolset.js";

const isLoopback = (hostname: string) =>
	hostname === "localhost" ||
	hostname === "0.0.0.0" ||
	hostname.startsWith("127.") ||
	hostname === "::1" ||
	hostname === "[::1]";

// CMA runs in Anthropic's cloud and cannot reach a loopback host, so MCP_SERVER_URL
// must be publicly reachable. Fail fast with an actionable message.
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
// Dev re-syncs every turn; prod syncs once per process.
const alwaysResync = process.env.NODE_ENV !== "production";
let agentConfigSynced = false;
const syncAgentConfig = async ({
	agentId,
	client,
	destructiveTools,
	docsText,
	expectedUrl,
	logger,
}: {
	agentId: string;
	client: Anthropic;
	destructiveTools: Iterable<string>;
	docsText: string;
	expectedUrl: string;
	logger: AutumnLogger;
}) => {
	if (agentConfigSynced && !alwaysResync) return;
	const agent = await client.beta.agents.retrieve(agentId);
	const expectedSystem = buildAgentSystem({ docsText });
	const currentUrl = agent.mcp_servers?.find(
		(server) => server.name === claudeManagedConfig.autumnMcpServerName,
	)?.url;
	const currentToolset = agent.tools?.find(
		(tool): tool is Extract<typeof tool, { type: "agent_toolset_20260401" }> =>
			tool.type === "agent_toolset_20260401",
	);
	const currentBuiltinSig = currentToolset
		? builtinSignatureFromToolset(currentToolset)
		: "";
	const mcpUrlChanged = currentUrl !== expectedUrl;
	const systemChanged = agent.system !== expectedSystem;
	const modelChanged = agent.model.id !== claudeManagedConfig.model;
	const toolsChanged = currentBuiltinSig !== desiredBuiltinSignature();
	if (mcpUrlChanged || systemChanged || modelChanged || toolsChanged) {
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
			...(toolsChanged
				? { tools: buildDesiredTools({ destructiveTools }) }
				: {}),
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
				tools_changed: toolsChanged,
				builtin_tools_from: currentBuiltinSig,
				builtin_tools_to: desiredBuiltinSignature(),
			},
		});
	}
	agentConfigSynced = true;
};

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
	if (cachedResources && agentConfigSynced && !alwaysResync) {
		return cachedResources;
	}

	const { destructiveTools, docsText } = await setupAgentToolContext({
		env,
		logger,
		token,
	});

	if (cachedResources) {
		await syncAgentConfig({
			agentId: cachedResources.agentId,
			client,
			destructiveTools,
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
			destructiveTools,
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
			tools: buildDesiredTools({ destructiveTools }),
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
