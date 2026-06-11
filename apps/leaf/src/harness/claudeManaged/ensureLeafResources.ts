import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { autumnChatInstructions } from "../../agent/prompts/instructions.js";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import { env as chatEnv } from "../../lib/env.js";
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

// Keep the shared agent's MCP URL in sync with MCP_SERVER_URL (it differs between
// prod and a local tunnel). Runs once per process — not per message — so a config
// change is picked up on restart without a hand-delete of the cached agent.
let mcpUrlSynced = false;
const syncAgentMcpUrl = async ({
	agentId,
	client,
	expectedUrl,
	logger,
}: {
	agentId: string;
	client: Anthropic;
	expectedUrl: string;
	logger: AutumnLogger;
}) => {
	if (mcpUrlSynced) return;
	const agent = await client.beta.agents.retrieve(agentId);
	const currentUrl = agent.mcp_servers?.find(
		(server) => server.name === claudeManagedConfig.autumnMcpServerName,
	)?.url;
	if (currentUrl !== expectedUrl) {
		await client.beta.agents.update(agentId, {
			mcp_servers: [
				{
					name: claudeManagedConfig.autumnMcpServerName,
					type: "url",
					url: expectedUrl,
				},
			],
			version: agent.version,
		});
		logger.info("Refreshed Claude Managed agent MCP URL", {
			event: "leaf.claude_managed_agent_mcp_url_refreshed",
			data: { agent_id: agentId, from: currentUrl, to: expectedUrl },
		});
	}
	mcpUrlSynced = true;
};

// Find-or-create the ONE shared Agent + Environment (not per tenant), cached
// in-memory so creation/find-by-name happens only on the first cold start. The agent
// is env-agnostic (env is conveyed per-session in the kickoff message); the message
// token is used only to read Autumn docs + the destructive-tool set when building.
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

	if (cachedResources) {
		await syncAgentMcpUrl({
			agentId: cachedResources.agentId,
			client,
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
		// An existing agent may have been built with a different MCP_SERVER_URL.
		await syncAgentMcpUrl({ agentId, client, expectedUrl: mcpUrl, logger });
	} else {
		const { destructiveTools, docsText } = await setupAgentToolContext({
			env,
			logger,
			token,
		});
		const agent = await client.beta.agents.create({
			model: claudeManagedConfig.model,
			name: claudeManagedConfig.agentName,
			system: [autumnChatInstructions, docsText].filter(Boolean).join("\n\n"),
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
		mcpUrlSynced = true;
		logger.info("Created shared Claude Managed agent", {
			event: "leaf.claude_managed_agent_created",
			data: { agent_id: agentId, environment_id: environmentId },
		});
	}

	cachedResources = { agentId, environmentId };
	return cachedResources;
};
