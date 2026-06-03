/**
 * Where a tool call originated:
 * - `mcp`   — an external MCP client hitting our hosted server (e.g. Claude
 *             Code, Cursor). The #1 usage-analytics target.
 * - `agent` — our own Autumn Ops agent (e.g. Slack) invoking tools
 *             internally. Drives agent reliability / failure detection.
 */
export type McpAnalyticsSurface = "mcp" | "agent";

export type McpAnalyticsEvent = {
	event: "mcp.tool_call";
	surface: McpAnalyticsSurface;
	tool: string;
	status: "ok" | "error";
	durationMs: number;
	principalId: string;
	env: string;
	/** Resolved lazily; may be absent if org resolution fails. */
	orgId?: string | undefined;
	/** HTTP User-Agent of the calling MCP client. Absent for `agent` surface. */
	client?: string | undefined;
	/** Stateless session grouping: hash(principal + client + time window). */
	sessionId: string;
	scopes?: string[] | undefined;
	/** Tool request payload (stored as an Axiom map field). */
	input?: unknown;
	/** Tool result payload (stored as an Axiom map field). */
	output?: unknown;
	error?: string | undefined;
};

/**
 * Pluggable destination for analytics events. Implementations must be
 * non-blocking: `emit` runs on the hot path of every tool call and must never
 * throw or await network I/O inline. Swap this (Axiom direct, `@axiomhq/pino`,
 * an OTEL exporter, a test spy) without touching the instrumentation layer.
 */
export interface AnalyticsSink {
	emit(event: McpAnalyticsEvent): void;
	/** Drain any buffered events. Call on graceful shutdown. */
	flush(): Promise<void>;
}
