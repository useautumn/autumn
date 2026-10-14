export type McpAnalyticsSurface = "mcp" | "agent";

export type McpAnalyticsContext = {
	orgId?: string | undefined;
	orgSlug?: string | undefined;
	env: string;
	scopes?: string[] | undefined;
};

export type McpAnalyticsEvent = {
	event: "mcp.tool_call";
	surface: McpAnalyticsSurface;
	tool: string;
	intent?: string | undefined;
	status: "ok" | "error";
	durationMs: number;
	principalId: string;
	client?: string | undefined;
	sessionId: string;
	context: McpAnalyticsContext;
	input?: unknown;
	output?: unknown;
	error?: string | undefined;
};

export interface AnalyticsSink {
	emit(event: McpAnalyticsEvent): void;
	flush(): Promise<void>;
}
