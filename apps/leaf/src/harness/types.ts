// Deliberately a lowest-common-denominator surface so Codex/Cursor SDKs can
// implement it later without interface changes. Not a framework — no loop,
// memory, or tool dispatch lives here; each harness keeps its own.

export type HarnessAttachment = {
	data: Buffer;
	mimeType: string;
	name?: string;
};

export type HarnessUserMessage = {
	attachments?: HarnessAttachment[];
	text: string;
};

export type HarnessToolCall = {
	input: Record<string, unknown>;
	/** MCP server name when the tool came from MCP; undefined for built-ins. */
	mcpServer?: string;
	name: string;
};

export type HarnessUsage = {
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
};

export type HarnessEvent =
	| { type: "text"; text: string }
	| ({ type: "tool_call" } & HarnessToolCall)
	| { type: "tool_result"; name: string; output: unknown }
	| ({ type: "approval_required"; id: string } & HarnessToolCall)
	| { type: "error"; message: string }
	| { type: "turn_end"; usage?: HarnessUsage };

export type HarnessMcpServerConfig = {
	headers?: Record<string, string>;
	url: string;
};

export type HarnessBuiltinTools = "all" | "web-only" | "none";

/** Serializable approval policy descriptor (crosses into the sandbox runner). */
export type HarnessApprovalPolicy = {
	mcpServer: string;
	toolNames: string[];
};

/**
 * A predicate (in-process only) or a serializable descriptor (required by
 * sandboxed harnesses, which run the policy in another process).
 */
export type HarnessApproval =
	| HarnessApprovalPolicy
	| ((tool: HarnessToolCall) => boolean);

export type HarnessSessionConfig = {
	builtinTools?: HarnessBuiltinTools;
	env?: Record<string, string>;
	/** In-process tool servers; shape is implementation-specific. */
	localMcpServers?: Record<string, unknown>;
	maxTurns?: number;
	mcpServers: Record<string, HarnessMcpServerConfig>;
	model?: string;
	requiresApproval?: HarnessApproval;
	/** Implementation-specific transcript store for cross-process resume. */
	sessionStore?: unknown;
	systemPrompt?: string;
	/** Tenant scope for sandboxed harnesses (e.g. one E2B sandbox per tenant). */
	tenant?: { env: string; id: string };
	/**
	 * Omitting configDir inherits the host's default credential store (dev only);
	 * production must set a per-session dir and inject an API key via env.
	 */
	workspace: { configDir?: string; cwd: string };
};

export type HarnessSession = {
	close(): Promise<void>;
	/** Harness-native session id; usable as a resume key after the first turn. */
	id: string | undefined;
	interrupt(): Promise<void>;
	/** Streams one turn; the final event is `turn_end`, `approval_required`, or `error`. */
	send(message: HarnessUserMessage): AsyncIterable<HarnessEvent>;
};

export type Harness = {
	createSession(config: HarnessSessionConfig): Promise<HarnessSession>;
	name: string;
	resumeSession(
		id: string,
		config: HarnessSessionConfig,
	): Promise<HarnessSession>;
};
