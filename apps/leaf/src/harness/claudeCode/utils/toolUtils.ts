import type { HarnessBuiltinTools } from "../../types.js";
import type { ParsedToolName } from "../types.js";

const WEB_TOOLS = ["WebSearch", "WebFetch"];

export const builtinToolsOption = ({
	builtinTools = "all",
}: {
	builtinTools?: HarnessBuiltinTools;
}) => {
	if (builtinTools === "all") {
		return { preset: "claude_code", type: "preset" } as const;
	}
	return builtinTools === "web-only" ? WEB_TOOLS : [];
};

// SDK names MCP tools `mcp__<server>__<tool>`.
export const parseToolName = ({
	rawName,
}: {
	rawName: string;
}): ParsedToolName => {
	if (!rawName.startsWith("mcp__")) return { name: rawName };
	const rest = rawName.slice("mcp__".length);
	const separator = rest.indexOf("__");
	if (separator === -1) return { name: rest };
	return {
		mcpServer: rest.slice(0, separator),
		name: rest.slice(separator + 2),
	};
};
