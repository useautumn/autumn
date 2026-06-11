// Claude Managed Agents (CMA) config. The shared Agent + Environment are
// auto-ensured at runtime (find-or-create by name, cached in the store) — there
// is no manual setup step and no per-tenant agent. Per-tenant isolation comes
// from the per-(org,env) vault + per-thread session. Only ANTHROPIC_API_KEY is a
// secret; everything stable is hardcoded here (config over env vars).

import { DEFAULT_CHAT_MODEL } from "../../lib/chatAgentConfig.js";

// Separate agent + environment per deployment: dev points its MCP server at a local
// tunnel and prod at the public URL, so a single shared agent would have its MCP URL
// flip-flopped between them on every restart (via syncAgentMcpUrl). Keep them distinct.
const isProd = process.env.NODE_ENV === "production";

export const claudeManagedConfig = {
	/** anthropic-beta header for the managed-agents API. */
	betaHeader: "managed-agents-2026-04-01",
	/** Shared Agent name (per deployment) — created once, reused across every tenant/session. */
	agentName: isProd ? "Autumn Leaf" : "Autumn Leaf (dev)",
	/** Shared cloud Environment name (per deployment). */
	environmentName: isProd ? "leaf" : "leaf-dev",
	/** MCP server name the agent references for Autumn tools (mcp_servers[].name). */
	autumnMcpServerName: "autumn",
	/** Model the agent runs on; strip the `anthropic/` provider prefix for the bare id. */
	model: DEFAULT_CHAT_MODEL.replace(/^anthropic\//, ""),
} as const;
