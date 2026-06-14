import type Anthropic from "@anthropic-ai/sdk";
import type { SessionTurnOutcome } from "../../common/types.js";

export type {
	SessionTurnOutcome,
	SessionTurnUsage,
	SuspendedToolCall,
} from "../../common/types.js";

// Streams one CMA turn to completion after `kickoff`, preserving text, tool
// results, usage, and pending destructive tool confirmations.
export const driveSessionTurn = async ({
	autumnMcpServerName,
	client,
	kickoff,
	onAutumnTool,
	onAutumnToolResult,
	onSandboxTool,
	onSessionRetry,
	onThinking,
	onToolError,
	onTurnEnd,
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
	onSandboxTool?: (input: {
		input: Record<string, unknown>;
		name: string;
	}) => Promise<void> | void;
	onSessionRetry?: (input: { message: string }) => Promise<void> | void;
	/** Fires when the agent starts an inference or emits thinking — drives the "still working" status. */
	onThinking?: () => void;
	onToolError?: (input: {
		name: string;
		output: unknown;
	}) => Promise<void> | void;
	/** Multi-turn pump: on "continue", the drained turn is emitted and the stream keeps being consumed. */
	onTurnEnd?: (
		turn: SessionTurnOutcome,
	) => Promise<"continue" | "stop"> | "continue" | "stop";
	sessionId: string;
}): Promise<SessionTurnOutcome> => {
	const outcome: SessionTurnOutcome = {
		textParts: [],
		toolResults: [],
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
	const mcpToolNames = new Map<string, string>();

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
			mcpToolNames.set(event.id, event.name);
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
			const resultEvent = event as typeof event & {
				is_error?: boolean;
				isError?: boolean;
			};
			const isError = resultEvent.is_error ?? resultEvent.isError;
			if (isError === true) {
				await onToolError?.({
					name: mcpToolNames.get(event.mcp_tool_use_id) ?? "tool",
					output: { content: event.content, isError: true },
				});
			}
			const name = autumnToolNames.get(event.mcp_tool_use_id);
			if (name) {
				const output =
					typeof isError === "boolean"
						? { content: event.content, isError }
						: event.content;
				outcome.toolResults?.push({
					id: event.mcp_tool_use_id,
					name,
					output,
				});
				await onAutumnToolResult?.({
					id: event.mcp_tool_use_id,
					name,
					output,
				});
			}
		} else if (event.type === "agent.tool_use") {
			await onSandboxTool?.({ input: event.input, name: event.name });
		} else if (event.type === "agent.thinking") {
			onThinking?.();
		} else if (event.type === "span.model_request_start") {
			onThinking?.();
		} else if (event.type === "span.model_request_end") {
			const usage = event.model_usage;
			outcome.usage.inputTokens += usage.input_tokens;
			outcome.usage.outputTokens += usage.output_tokens;
			outcome.usage.cacheReadInputTokens += usage.cache_read_input_tokens;
			outcome.usage.cacheCreationInputTokens +=
				usage.cache_creation_input_tokens;
		} else if (event.type === "session.error") {
			const error = event.error as {
				message?: string;
				retry_status?: { type?: string };
			};
			// Anthropic-side retries recover on their own — surface them without
			// poisoning the turn outcome.
			if (error.retry_status?.type === "retrying") {
				await onSessionRetry?.({
					message: error.message ?? "transient error",
				});
			} else {
				outcome.errorMessage = error.message ?? "Session error";
			}
		} else if (event.type === "session.status_terminated") {
			break;
		} else if (event.type === "session.status_idle") {
			if (event.stop_reason.type === "requires_action") {
				// Awaited ids can reference tool calls streamed in an earlier
				// turn; surface them even without local metadata.
				const queue = event.stop_reason.event_ids.map((eventId) => {
					const call = pendingAsk.get(eventId);
					return {
						args: call?.input ?? {},
						toolCallId: eventId,
						toolName: call?.name ?? "unknown",
					};
				});
				if (queue.length > 0) {
					outcome.suspendedQueue = queue;
				}
				break;
			}
			if (event.stop_reason.type === "end_turn" && onTurnEnd) {
				const decision = await onTurnEnd(outcome);
				if (decision === "continue") {
					outcome.textParts = [];
					outcome.toolResults = [];
					continue;
				}
			}
			// end_turn and retries_exhausted are turn-terminal.
			break;
		}
	}
	return outcome;
};
