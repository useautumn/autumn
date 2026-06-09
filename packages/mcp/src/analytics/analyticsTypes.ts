/**
 * Where a tool call originated:
 * - `mcp`   — an external MCP client hitting our hosted server (e.g. Claude
 *             Code, Cursor). The #1 usage-analytics target.
 * - `agent` — our own Autumn Ops agent (e.g. Slack) invoking tools
 *             internally. Drives agent reliability / failure detection.
 */
export type McpAnalyticsSurface = "mcp" | "agent";

/**
 * Org/auth context for a tool call. Mirrors the server's `context.*` log shape
 * (see server/src/utils/logging) so MCP analytics and agent logs unify cleanly.
 */
export type McpAnalyticsContext = {
	/** Autumn org id. Resolved lazily; may be absent if resolution fails. */
	orgId?: string | undefined;
	/** Autumn org slug. Resolved lazily; may be absent if resolution fails. */
	orgSlug?: string | undefined;
	env: string;
	scopes?: string[] | undefined;
};

export type McpAnalyticsEvent = {
	event: "mcp.tool_call";
	surface: McpAnalyticsSurface;
	tool: string;
	/** One-sentence statement of what the caller is trying to do. */
	intent?: string | undefined;
	status: "ok" | "error";
	durationMs: number;
	principalId: string;
	/** HTTP User-Agent of the calling MCP client. Absent for `agent` surface. */
	client?: string | undefined;
	/** MCP transport session id, or fallback hash(principal + client + window). */
	sessionId: string;
	context: McpAnalyticsContext;
	/** Tool request payload (stored as an Axiom map field). */
	input?: unknown;
	/** Tool result payload (stored as an Axiom map field). */
	output?: unknown;
	error?: string | undefined;
};

/**
 * Pluggable destination for analytics events. Implementations must be
 * non-blocking: `emit` runs on the hot path of every tool call and must never
 * throw or await network I/O inline. Swap this (pino/Axiom, an OTEL exporter,
 * a test spy) without touching the instrumentation layer.
 */
export interface AnalyticsSink {
	emit(event: McpAnalyticsEvent): void;
	/** Drain any buffered events. Call on graceful shutdown. */
	flush(): Promise<void>;
}
