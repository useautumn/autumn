import type {
	McpServerConfig,
	Options,
	SessionStore,
} from "@anthropic-ai/claude-agent-sdk";
import type { HarnessSessionConfig } from "../../types.js";
import { builtinToolsOption } from "./toolUtils.js";

const toMcpServers = ({
	config,
}: {
	config: HarnessSessionConfig;
}): Record<string, McpServerConfig> => {
	const servers: Record<string, McpServerConfig> = {};
	for (const [name, server] of Object.entries(config.mcpServers)) {
		servers[name] = {
			// Load full tool schemas up front instead of deferring behind tool search;
			// the agent needs exact input shapes (e.g. epoch-ms timestamps) from turn 1.
			alwaysLoad: true,
			headers: server.headers,
			type: "http",
			url: server.url,
		};
	}
	for (const [name, server] of Object.entries(config.localMcpServers ?? {})) {
		servers[name] = server as McpServerConfig;
	}
	return servers;
};

export const buildQueryOptions = ({
	config,
	sessionId,
}: {
	config: HarnessSessionConfig;
	sessionId?: string;
}): Options => ({
	cwd: config.workspace.cwd,
	env: {
		...process.env,
		...config.env,
		CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
		// Setting CLAUDE_CONFIG_DIR bypasses keychain auth, so only set when isolating.
		...(config.workspace.configDir
			? { CLAUDE_CONFIG_DIR: config.workspace.configDir }
			: {}),
	},
	maxTurns: config.maxTurns,
	mcpServers: toMcpServers({ config }),
	model: config.model,
	resume: sessionId,
	sessionStore: config.sessionStore as SessionStore | undefined,
	settingSources: [],
	systemPrompt: config.systemPrompt,
	// Summarized thinking so traces (Braintrust) show the agent's reasoning.
	thinking: { display: "summarized", type: "adaptive" },
	tools: builtinToolsOption({ builtinTools: config.builtinTools }),
});
