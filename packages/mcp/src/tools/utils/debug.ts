/** Opt-in tracing for the pending-action flow (set MCP_DEBUG_PENDING_ACTIONS=1). */
export const logTool = (event: string, data: Record<string, unknown>) => {
	if (process.env.MCP_DEBUG_PENDING_ACTIONS !== "1") return;
	console.log(`[mcp:agent-tools] ${event} ${JSON.stringify(data)}`);
};
