import type Anthropic from "@anthropic-ai/sdk";
import { type LeafSurface, leafSystemPrompt } from "@autumn/agent-docs/agent";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { setupAgentToolContext } from "../../agent/runMessage/setup/setupAgentToolContext.js";
import { env as chatEnv } from "../../lib/env.js";
import { claudeManagedConfig } from "./config.js";
import { ensureLeafSkills, type LeafSkillRef, skillsMatch } from "./skills.js";
import {
	type BuiltinToolsetLike,
	buildDesiredTools,
	builtinSignatureFromToolset,
	type ClaudeManagedToolset,
	desiredBuiltinSignature,
	type McpToolsetLike,
	mcpSignatureFromToolset,
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

const buildAutumnMcpServers = (mcpUrl: string) => [
	{
		name: claudeManagedConfig.autumnMcpServerName,
		type: "url" as const,
		url: mcpUrl,
	},
];

type AutumnMcpServer = ReturnType<typeof buildAutumnMcpServers>[number];

type LeafManagedResources = {
	agentId: string;
	environmentId: string;
	mcpServers: AutumnMcpServer[];
	tools: ClaudeManagedToolset[];
};

const isBuiltinToolset = (tool: { type: string }): tool is BuiltinToolsetLike =>
	tool.type === "agent_toolset_20260401";

const isAutumnMcpToolset = (tool: {
	mcp_server_name?: string;
	type: string;
}): tool is McpToolsetLike =>
	tool.type === "mcp_toolset" &&
	tool.mcp_server_name === claudeManagedConfig.autumnMcpServerName;

const findToolsets = (
	tools?: Array<{ mcp_server_name?: string; type: string }>,
) => ({
	builtinToolset: tools?.find(isBuiltinToolset),
	mcpToolset: tools?.find(isAutumnMcpToolset),
});

const findAutumnMcpUrl = (servers?: Array<{ name: string; url: string }>) =>
	servers?.find(
		(server) => server.name === claudeManagedConfig.autumnMcpServerName,
	)?.url;

const toolConfigDiff = ({
	currentMcpServers,
	currentTools,
	expectedMcpServers,
	expectedTools,
}: {
	currentMcpServers?: Array<{ name: string; url: string }>;
	currentTools?: Array<{ mcp_server_name?: string; type: string }>;
	expectedMcpServers: AutumnMcpServer[];
	expectedTools: ClaudeManagedToolset[];
}) => {
	const {
		builtinToolset: currentBuiltinToolset,
		mcpToolset: currentMcpToolset,
	} = findToolsets(currentTools);
	const { mcpToolset: expectedMcpToolset } = findToolsets(expectedTools);
	const currentBuiltinSig = currentBuiltinToolset
		? builtinSignatureFromToolset(currentBuiltinToolset)
		: "";
	const expectedBuiltinSig = desiredBuiltinSignature();
	const currentMcpSig = mcpSignatureFromToolset(currentMcpToolset);
	const expectedMcpSig = mcpSignatureFromToolset(expectedMcpToolset);
	const currentMcpUrl = findAutumnMcpUrl(currentMcpServers);
	const expectedMcpUrl = findAutumnMcpUrl(expectedMcpServers);

	return {
		builtinChanged: currentBuiltinSig !== expectedBuiltinSig,
		currentBuiltinSig,
		currentMcpUrl,
		expectedBuiltinSig,
		expectedMcpUrl,
		mcpPermissionsChanged: currentMcpSig !== expectedMcpSig,
		mcpUrlChanged: currentMcpUrl !== expectedMcpUrl,
	};
};

// Dev re-syncs every turn; prod re-syncs only when the token-derived tool policy changes.
const alwaysResync = process.env.NODE_ENV !== "production";
const syncedResourceKeysBySurface = new Map<LeafSurface, string>();

// Caches the setupAgentToolContext round trip briefly; dev always fetches fresh
// so tool-policy edits take effect.
const TOOL_CONTEXT_TTL_MS = 60_000;
const destructiveToolsByToken = new Map<
	string,
	{ destructiveTools: Set<string>; expiresAt: number }
>();

const resolveDestructiveTools = async ({
	env,
	logger,
	token,
}: {
	env: AppEnv;
	logger: AutumnLogger;
	token: string;
}) => {
	if (alwaysResync) {
		return (await setupAgentToolContext({ env, logger, token }))
			.destructiveTools;
	}
	const now = Date.now();
	const cached = destructiveToolsByToken.get(token);
	if (cached && cached.expiresAt > now) return cached.destructiveTools;
	for (const [key, entry] of destructiveToolsByToken) {
		if (entry.expiresAt <= now) destructiveToolsByToken.delete(key);
	}
	const { destructiveTools } = await setupAgentToolContext({
		env,
		logger,
		token,
	});
	destructiveToolsByToken.set(token, {
		destructiveTools,
		expiresAt: now + TOOL_CONTEXT_TTL_MS,
	});
	return destructiveTools;
};

const toolSignatureFromTools = (tools: ClaudeManagedToolset[]) => {
	const { builtinToolset, mcpToolset } = findToolsets(tools);
	return {
		builtin: builtinToolset ? builtinSignatureFromToolset(builtinToolset) : "",
		mcp: mcpSignatureFromToolset(mcpToolset),
	};
};

const resourceCacheKey = ({
	surface,
	tools,
}: {
	surface: LeafSurface;
	tools: ClaudeManagedToolset[];
}) => JSON.stringify({ surface, tools: toolSignatureFromTools(tools) });

const isResourceSynced = ({
	cacheKey,
	surface,
}: {
	cacheKey: string;
	surface: LeafSurface;
}) => syncedResourceKeysBySurface.get(surface) === cacheKey;

const syncAgentConfig = async ({
	agentId,
	client,
	cacheKey,
	expectedMcpServers,
	expectedTools,
	logger,
	skills,
	surface,
}: {
	agentId: string;
	client: Anthropic;
	cacheKey: string;
	expectedMcpServers: AutumnMcpServer[];
	expectedTools: ClaudeManagedToolset[];
	logger: AutumnLogger;
	skills: LeafSkillRef[];
	surface: LeafSurface;
}) => {
	if (isResourceSynced({ cacheKey, surface }) && !alwaysResync) return;
	const agent = await client.beta.agents.retrieve(agentId);
	const expectedSystem = buildAgentSystem({ surface });
	const diff = toolConfigDiff({
		currentMcpServers: agent.mcp_servers,
		currentTools: agent.tools,
		expectedMcpServers,
		expectedTools,
	});
	const systemChanged = agent.system !== expectedSystem;
	const modelChanged = agent.model.id !== claudeManagedConfig.model;
	const toolsChanged = diff.builtinChanged || diff.mcpPermissionsChanged;
	const skillsChanged = !skillsMatch(agent.skills, skills);
	if (
		diff.mcpUrlChanged ||
		systemChanged ||
		modelChanged ||
		toolsChanged ||
		skillsChanged
	) {
		await client.beta.agents.update(agentId, {
			...(diff.mcpUrlChanged
				? {
						mcp_servers: expectedMcpServers,
					}
				: {}),
			...(systemChanged ? { system: expectedSystem } : {}),
			...(modelChanged ? { model: claudeManagedConfig.model } : {}),
			...(toolsChanged ? { tools: expectedTools } : {}),
			...(skillsChanged ? { skills } : {}),
			version: agent.version,
		});
		logger.info("Refreshed Claude Managed agent config", {
			event: "leaf.claude_managed_agent_config_refreshed",
			data: {
				agent_id: agentId,
				mcp_url_changed: diff.mcpUrlChanged,
				mcp_url_from: diff.currentMcpUrl,
				mcp_url_to: diff.expectedMcpUrl,
				system_changed: systemChanged,
				model_changed: modelChanged,
				model_from: agent.model.id,
				model_to: claudeManagedConfig.model,
				tools_changed: toolsChanged,
				builtin_tools_changed: diff.builtinChanged,
				builtin_tools_from: diff.currentBuiltinSig,
				builtin_tools_to: diff.expectedBuiltinSig,
				mcp_permissions_changed: diff.mcpPermissionsChanged,
			},
		});
	}
	syncedResourceKeysBySurface.set(surface, cacheKey);
};

// Skips the session retrieve when the desired tools/MCP URL haven't changed
// since the last sync.
const MAX_SESSION_SIGNATURE_CACHE = 500;
const lastSyncedSessionSignatures = new Map<string, string>();

const sessionSyncSignature = (resources: LeafManagedResources) =>
	JSON.stringify({
		mcpUrl: findAutumnMcpUrl(resources.mcpServers),
		tools: toolSignatureFromTools(resources.tools),
	});

const rememberSessionSignature = (sessionId: string, signature: string) => {
	if (lastSyncedSessionSignatures.size >= MAX_SESSION_SIGNATURE_CACHE) {
		lastSyncedSessionSignatures.clear();
	}
	lastSyncedSessionSignatures.set(sessionId, signature);
};

export const syncClaudeManagedSessionAgentConfig = async ({
	client,
	env,
	logger,
	orgId,
	resources,
	sessionId,
}: {
	client: Anthropic;
	env: AppEnv;
	logger: AutumnLogger;
	orgId: string;
	resources: LeafManagedResources;
	sessionId: string;
}) => {
	const signature = sessionSyncSignature(resources);
	if (lastSyncedSessionSignatures.get(sessionId) === signature) return;

	const session = await client.beta.sessions.retrieve(sessionId);
	const diff = toolConfigDiff({
		currentMcpServers: session.agent.mcp_servers,
		currentTools: session.agent.tools,
		expectedMcpServers: resources.mcpServers,
		expectedTools: resources.tools,
	});
	const toolsChanged = diff.builtinChanged || diff.mcpPermissionsChanged;
	if (!diff.mcpUrlChanged && !toolsChanged) {
		rememberSessionSignature(sessionId, signature);
		return;
	}

	await client.beta.sessions.update(sessionId, {
		agent: {
			...(diff.mcpUrlChanged ? { mcp_servers: resources.mcpServers } : {}),
			...(toolsChanged ? { tools: resources.tools } : {}),
		},
	});
	logger.info("Refreshed Claude Managed session agent config", {
		event: "leaf.claude_managed_session_agent_config_refreshed",
		context: { env, org_id: orgId },
		data: {
			session_id: sessionId,
			mcp_url_changed: diff.mcpUrlChanged,
			mcp_url_from: diff.currentMcpUrl,
			mcp_url_to: diff.expectedMcpUrl,
			tools_changed: toolsChanged,
			builtin_tools_changed: diff.builtinChanged,
			mcp_permissions_changed: diff.mcpPermissionsChanged,
		},
	});
	rememberSessionSignature(sessionId, signature);
};

const cachedResources = new Map<string, LeafManagedResources>();
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
}): Promise<LeafManagedResources> => {
	const mcpUrl = autumnMcpUrl();
	const mcpServers = buildAutumnMcpServers(mcpUrl);

	const destructiveTools = await resolveDestructiveTools({
		env,
		logger,
		token,
	});
	const tools = buildDesiredTools({ destructiveTools });
	const cacheKey = resourceCacheKey({ surface, tools });
	const cached = cachedResources.get(cacheKey);
	if (cached && isResourceSynced({ cacheKey, surface }) && !alwaysResync) {
		return cached;
	}

	const skills = await ensureLeafSkills(client);

	if (cached) {
		await syncAgentConfig({
			agentId: cached.agentId,
			cacheKey,
			client,
			expectedMcpServers: mcpServers,
			expectedTools: tools,
			logger,
			skills,
			surface,
		});
		const resources = { ...cached, mcpServers, tools };
		cachedResources.set(cacheKey, resources);
		return resources;
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
			cacheKey,
			client,
			expectedMcpServers: mcpServers,
			expectedTools: tools,
			logger,
			skills,
			surface,
		});
	} else {
		const agent = await client.beta.agents.create({
			model: claudeManagedConfig.model,
			name: agentName,
			system: buildAgentSystem({ surface }),
			mcp_servers: mcpServers,
			skills,
			tools,
		});
		agentId = agent.id;
		syncedResourceKeysBySurface.set(surface, cacheKey);
		logger.info("Created shared Claude Managed agent", {
			event: "leaf.claude_managed_agent_created",
			data: { agent_id: agentId, environment_id: environmentId, surface },
		});
	}

	const resources = { agentId, environmentId, mcpServers, tools };
	cachedResources.set(cacheKey, resources);
	return resources;
};
