import {
	DEFAULT_CHAT_MODEL,
	VERCEL_HARNESS_ADAPTER,
} from "../../lib/chatAgentConfig.js";

// The claude CLI wants a bare Anthropic model id, not the "anthropic/" gateway prefix.
const claudeModel = DEFAULT_CHAT_MODEL.replace(/^anthropic\//, "");

export const vercelHarnessConfig = {
	adapter: VERCEL_HARNESS_ADAPTER,
	autumnMcpServerName: "autumn",
	model: claudeModel,
} as const;
