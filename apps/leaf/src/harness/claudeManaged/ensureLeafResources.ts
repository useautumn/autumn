import type Anthropic from "@anthropic-ai/sdk";
import { type LeafSurface, leafSystemPrompt } from "@autumn/agent-docs/agent";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import { env as chatEnv } from "../../lib/env.js";
import { claudeManagedConfig } from "./config.js";
import { ensureLeafSkills, type LeafSkillRef, skillsMatch } from "./skills.js";
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

const autumnMcpUrl = () => {
	const base = chatEnv.MCP_SERVER_URL;
	const url = new URL(base);
	if (isLoopback(url.hostname)) {
		throw new Error(
			`MCP_SERVER_URL must be publicly reachable for Claude Managed Agents, but is "${base}". Point it at your public tunnel (e.g. https://j.dev.useautumn.com), which proxies /mcp to leaf.`,
		);
	}
	if (url.protocol !== "https:") {
		throw new Error(
			`MCP_SERVER_URL must be HTTPS for Claude Managed Agents, but is "${base}". Point it at your public tunnel (e.g. https://j.dev.useautumn.com), which proxies /mcp to leaf.`,
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

// Knowledge is attached as skills (ensureLeafSkills) and loads on demand; the
// system carries just the surface instructions.
export const buildAgentSystem = ({ surface }: { surface: LeafSurface }) =>
	leafSystemPrompt(surface);

const agentNameForSurface = (surface: LeafSurface) =>
	surface === "slack"
		? claudeManagedConfig.agentName
		: `${claudeManagedConfig.agentName} Dashboard`;

// Keep the shared agent config in sync with local code/tunnel changes.
// Dev re-syncs every turn; prod syncs once per process.
const alwaysResync = process.env.NODE_ENV !== "production";
const syncedSurfaces = new Set<LeafSurface>();
const syncAgentConfig = async ({
	agentId,
	client,
	destructiveTools,
	expectedUrl,
	logger,
	skills,
	surface,
}: {
	agentId: string;
	client: Anthropic;
	destructiveTools: Iterable<string>;
	expectedUrl: string;
	logger: AutumnLogger;
	skills: LeafSkillRef[];
	surface: LeafSurface;
}) => {
	if (syncedSurfaces.has(surface) && !alwaysResync) return;
	const agent = await client.beta.agents.retrieve(agentId);
	const expectedSystem = buildAgentSystem({ surface });
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
	const skillsChanged = !skillsMatch(agent.skills, skills);
	if (
		mcpUrlChanged ||
		systemChanged ||
		modelChanged ||
		toolsChanged ||
		skillsChanged
	) {
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
			...(skillsChanged ? { skills } : {}),
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
	syncedSurfaces.add(surface);
};

const cachedResources = new Map<
	LeafSurface,
	{ agentId: string; environmentId: string }
>();
export const ensureLeafResources = async ({
	client,
	env,
	logger,
	surface,
	token,
}: {
	client: Anthropic;
	env: AppEnv;
	logger: AutumnLogger;
	surface: LeafSurface;
	token: string;
}): Promise<{ agentId: string; environmentId: string }> => {
	const mcpUrl = autumnMcpUrl();
	const cached = cachedResources.get(surface);
	if (cached && syncedSurfaces.has(surface) && !alwaysResync) {
		return cached;
	}

	const [{ destructiveTools }, skills] = await Promise.all([
		setupAgentToolContext({ env, logger, token }),
		ensureLeafSkills(client),
	]);

	if (cached) {
		await syncAgentConfig({
			agentId: cached.agentId,
			client,
			destructiveTools,
			expectedUrl: mcpUrl,
			logger,
			skills,
			surface,
		});
		return cached;
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

	const agentName = agentNameForSurface(surface);
	let agentId = await findAgentByName(client, agentName);
	if (agentId) {
		await syncAgentConfig({
			agentId,
			client,
			destructiveTools,
			expectedUrl: mcpUrl,
			logger,
			skills,
			surface,
		});
	} else {
		const agent = await client.beta.agents.create({
			model: claudeManagedConfig.model,
			name: agentName,
			system: buildAgentSystem({ surface }),
			mcp_servers: [
				{
					name: claudeManagedConfig.autumnMcpServerName,
					type: "url",
					url: mcpUrl,
				},
			],
			skills,
			tools: buildDesiredTools({ destructiveTools }),
		});
		agentId = agent.id;
		syncedSurfaces.add(surface);
		logger.info("Created shared Claude Managed agent", {
			event: "leaf.claude_managed_agent_created",
			data: { agent_id: agentId, environment_id: environmentId, surface },
		});
	}

	const resources = { agentId, environmentId };
	cachedResources.set(surface, resources);
	return resources;
};
