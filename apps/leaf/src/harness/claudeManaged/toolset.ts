import { claudeManagedConfig } from "./config.js";

/** Built-in CMA sandbox tools the managed agent gets alongside Autumn MCP. Empty
 * omits the sandbox toolset entirely — smaller prefill and no sandbox provisioning,
 * since the billing agent only needs Autumn MCP tools. */
export type ClaudeManagedBuiltinTool =
	| "bash"
	| "edit"
	| "read"
	| "write"
	| "glob"
	| "grep"
	| "web_fetch"
	| "web_search";

export const claudeManagedBuiltinTools: readonly ClaudeManagedBuiltinTool[] = [];

const ALL_BUILTIN_TOOLS: readonly ClaudeManagedBuiltinTool[] = [
	"bash",
	"edit",
	"read",
	"write",
	"glob",
	"grep",
	"web_fetch",
	"web_search",
];

// Empty config omits the toolset entirely so the agent carries only Autumn MCP tools.
const buildAgentToolset = () =>
	claudeManagedBuiltinTools.length === 0
		? undefined
		: {
				type: "agent_toolset_20260401" as const,
				default_config: { enabled: false },
				configs: claudeManagedBuiltinTools.map((name) => ({
					enabled: true as const,
					name,
				})),
			};

export const buildDesiredTools = ({
	destructiveTools,
}: {
	destructiveTools: Iterable<string>;
}) => {
	const toolset = buildAgentToolset();
	const mcpToolset = {
		configs: [...destructiveTools].map((name) => ({
			name,
			permission_policy: { type: "always_ask" as const },
		})),
		default_config: { permission_policy: { type: "always_allow" as const } },
		mcp_server_name: claudeManagedConfig.autumnMcpServerName,
		type: "mcp_toolset" as const,
	};
	return toolset ? [toolset, mcpToolset] : [mcpToolset];
};

export const desiredBuiltinSignature = () =>
	[...claudeManagedBuiltinTools].sort().join(",");

export const builtinSignatureFromToolset = (toolset: {
	configs?: { enabled: boolean; name: string }[];
	default_config?: { enabled: boolean } | null;
}) => {
	const enabled = new Set<string>(
		toolset.default_config?.enabled === false ? [] : ALL_BUILTIN_TOOLS,
	);
	for (const config of toolset.configs ?? []) {
		if (config.enabled) {
			enabled.add(config.name);
		} else {
			enabled.delete(config.name);
		}
	}
	return [...enabled].sort().join(",");
};
