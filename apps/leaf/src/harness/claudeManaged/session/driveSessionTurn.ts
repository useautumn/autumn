import type Anthropic from "@anthropic-ai/sdk";
import { logger as rootLogger } from "../../../lib/logger.js";
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
	expectedToolResult,
	kickoff,
	onAutumnTool,
	onAutumnToolResult,
	onSandboxTool,
	onSessionRetry,
	onThinking,
	onToolError,
	onTurnEnd,
	perfLabel,
	sessionId,
}: {
	autumnMcpServerName: string;
	client: Anthropic;
	/** A tool whose `mcp_tool_use` happened in an earlier turn (e.g. an approval
	 * being resumed) — seed its id+name so this turn captures its result. */
	expectedToolResult?: { toolName: string; toolUseId: string };
	kickoff: () => Promise<unknown>;
	/** Label for the turn-latency log (e.g. "first", "resume"). */
	perfLabel?: string;
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
	if (expectedToolResult) {
		autumnToolNames.set(
			expectedToolResult.toolUseId,
			expectedToolResult.toolName,
		);
		// Also seed mcpToolNames so a resumed tool's error keeps its name.
		mcpToolNames.set(expectedToolResult.toolUseId, expectedToolResult.toolName);
	}

	// Time-to-first milestones, relative to turn kickoff — surfaces where the
	// first-response latency goes (stream open, inference start, first text/tool,
	// the serial skill-read round-trips).
	const turnStart = performance.now();
	const milestones: Record<string, number> = {};
	const mark = (name: string) => {
		milestones[name] ??= Math.round(performance.now() - turnStart);
	};
	// Counters to split the turn: is the time many inference cycles, serial
	// skill reads, or one long think?
	let inferenceCount = 0;
	let sandboxReadCount = 0;
	let inferenceMs = 0;
	let inferenceStart = 0;

	const stream = await client.beta.sessions.events.stream(sessionId);
	mark("stream_open");
	await kickoff();
	mark("kickoff_sent");

	const verbose = Boolean(process.env.LEAF_PERF_VERBOSE);
	let lastEventAt = performance.now();
	for await (const event of stream) {
		if (verbose) {
			const now = performance.now();
			process.stderr.write(
				`[perf-ev] +${Math.round(now - turnStart)}ms (gap ${Math.round(
					now - lastEventAt,
				)}ms) ${event.type}\n`,
			);
			lastEventAt = now;
		}
		mark("first_event");
		if (
			event.type === "agent.message" &&
			event.content.some((b) => b.type === "text" && b.text)
		) {
			mark("first_text");
		} else if (event.type === "agent.mcp_tool_use") {
			mark("first_mcp_tool");
		} else if (event.type === "agent.tool_use") {
			mark("first_sandbox_tool");
		} else if (
			event.type === "agent.thinking" ||
			event.type === "span.model_request_start"
		) {
			mark("first_inference");
		}
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
			sandboxReadCount += 1;
			await onSandboxTool?.({ input: event.input, name: event.name });
		} else if (event.type === "agent.thinking") {
			onThinking?.();
		} else if (event.type === "span.model_request_start") {
			inferenceCount += 1;
			inferenceStart = performance.now();
			onThinking?.();
		} else if (event.type === "span.model_request_end") {
			// Only count a request we saw start, so an unpaired end can't add a
			// bogus (turn-start-relative) duration.
			if (inferenceStart) {
				inferenceMs += performance.now() - inferenceStart;
				inferenceStart = 0;
			}
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
	const turnPerf = {
		label: perfLabel ?? "turn",
		total_ms: Math.round(performance.now() - turnStart),
		milestones_ms: milestones,
		inference_count: inferenceCount,
		inference_ms: Math.round(inferenceMs),
		sandbox_reads: sandboxReadCount,
		autumn_tool_calls: outcome.toolResults?.length ?? 0,
		input_tokens: outcome.usage.inputTokens,
		cache_read_tokens: outcome.usage.cacheReadInputTokens,
		suspended: Boolean(outcome.suspendedQueue?.length),
	};
	rootLogger.info("[perf] session turn", {
		event: "leaf.session_turn_latency",
		data: turnPerf,
	});
	// The app logger is silenced in eval/bench processes; mirror to stderr when
	// profiling so the standalone latency bench can read the breakdown.
	if (process.env.LEAF_PERF) {
		process.stderr.write(`[perf] session_turn ${JSON.stringify(turnPerf)}\n`);
	}
	return outcome;
};
