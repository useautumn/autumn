import type Anthropic from "@anthropic-ai/sdk";

export type SessionTurnUsage = {
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	inputTokens: number;
	outputTokens: number;
};

export type SessionTurnOutcome = {
	errorMessage?: string;
	suspended?: {
		args: Record<string, unknown>;
		toolCallId: string;
		toolName: string;
	};
	textParts: string[];
	usage: SessionTurnUsage;
};

// Streams one CMA turn to completion. Opens the stream first, then runs `kickoff`
// (send the user message / tool confirmation) so no early events are missed.
// Accumulates agent text + token usage, surfaces Autumn MCP tool calls/results
// (for the Slack action log + Braintrust spans), and stops at idle or terminated.
// A `requires_action` idle (a destructive tool needs approval) becomes `suspended`.
export const driveSessionTurn = async ({
	autumnMcpServerName,
	client,
	kickoff,
	onAutumnTool,
	onAutumnToolResult,
	sessionId,
}: {
	autumnMcpServerName: string;
	client: Anthropic;
	kickoff: () => Promise<unknown>;
	onAutumnTool?: (input: {
		id: string;
		input: Record<string, unknown>;
		name: string;
	}) => Promise<void> | void;
	onAutumnToolResult?: (input: {
		id: string;
		name: string;
		output: unknown;
	}) => Promise<void> | void;
	sessionId: string;
}): Promise<SessionTurnOutcome> => {
	const outcome: SessionTurnOutcome = {
		textParts: [],
		usage: {
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			inputTokens: 0,
			outputTokens: 0,
		},
	};
	const pendingAsk = new Map<
		string,
		{ input: Record<string, unknown>; name: string }
	>();
	const autumnToolNames = new Map<string, string>();

	const stream = await client.beta.sessions.events.stream(sessionId);
	await kickoff();

	for await (const event of stream) {
		if (event.type === "agent.message") {
			for (const block of event.content) {
				if (block.type === "text" && block.text) {
					outcome.textParts.push(block.text);
				}
			}
		} else if (event.type === "agent.mcp_tool_use") {
			if (event.mcp_server_name === autumnMcpServerName) {
				autumnToolNames.set(event.id, event.name);
				await onAutumnTool?.({
					id: event.id,
					input: event.input,
					name: event.name,
				});
			}
			if (event.evaluated_permission === "ask") {
				pendingAsk.set(event.id, { input: event.input, name: event.name });
			}
		} else if (event.type === "agent.mcp_tool_result") {
			const name = autumnToolNames.get(event.mcp_tool_use_id);
			if (name) {
				await onAutumnToolResult?.({
					id: event.mcp_tool_use_id,
					name,
					output: event.content,
				});
			}
		} else if (event.type === "span.model_request_end") {
			const usage = event.model_usage;
			outcome.usage.inputTokens += usage.input_tokens;
			outcome.usage.outputTokens += usage.output_tokens;
			outcome.usage.cacheReadInputTokens += usage.cache_read_input_tokens;
			outcome.usage.cacheCreationInputTokens +=
				usage.cache_creation_input_tokens;
		} else if (event.type === "session.error") {
			outcome.errorMessage =
				(event.error as { message?: string }).message ?? "Session error";
		} else if (event.type === "session.status_terminated") {
			break;
		} else if (event.type === "session.status_idle") {
			if (event.stop_reason.type === "requires_action") {
				const id =
					event.stop_reason.event_ids.find((e) => pendingAsk.has(e)) ??
					event.stop_reason.event_ids[0];
				const call = id ? pendingAsk.get(id) : undefined;
				if (id && call) {
					outcome.suspended = {
						args: call.input,
						toolCallId: id,
						toolName: call.name,
					};
				}
			}
			// requires_action, end_turn, and retries_exhausted are all turn-terminal.
			break;
		}
	}
	return outcome;
};
