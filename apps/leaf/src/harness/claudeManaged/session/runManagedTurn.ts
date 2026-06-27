import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import type { Span } from "braintrust";
import { formatToolAction } from "../../../agent/tools/autumnMcp.js";
import {
	isSilentTool,
	isToolErrorResult,
	normalizeToolName,
	sandboxToolLabel,
	toolLabel,
} from "../../../agent/tools/toolPolicy.js";
import { approvalErrorResult } from "../../../internal/approvals/utils/approvalErrors.js";
import {
	isPreviewTool,
	writeToPreviewTool,
} from "../../../internal/approvals/utils/toolRegistry.js";
import type { KeyedActionLogger } from "../../../ui/progress.js";
import { claudeManagedConfig } from "../config.js";
import {
	driveSessionTurn,
	type SessionTurnOutcome,
} from "./driveSessionTurn.js";
import type { UserMessageContentBlock } from "./userMessage.js";

const SLEEP_COMMAND_REGEX = /^\s*sleep\s+(\d+)/;
const SURFACED_SLEEP_MIN_SECONDS = 5;
const ERROR_LINE_MAX_LENGTH = 120;

const shortErrorMessage = (output: unknown) => {
	const message = approvalErrorResult(output).message;
	return message.length > ERROR_LINE_MAX_LENGTH
		? `${message.slice(0, ERROR_LINE_MAX_LENGTH - 1)}…`
		: message;
};

const isWaitingOnSessionResponseError = (error: unknown) =>
	error instanceof Error &&
	error.message.includes("waiting on responses to events");

const interruptSession = async ({
	client,
	sessionId,
}: {
	client: Anthropic;
	sessionId: string;
}) =>
	await driveSessionTurn({
		autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
		client,
		kickoff: () =>
			client.beta.sessions.events.send(sessionId, {
				events: [{ type: "user.interrupt" }],
			}),
		sessionId,
	});

export const runClaudeManagedTurn = async ({
	client,
	content,
	env,
	logger,
	onAction,
	onActionKeyed,
	onThinking,
	onTurnEnd,
	orgId,
	sessionId,
	span,
}: {
	client: Anthropic;
	content: UserMessageContentBlock[];
	env: AppEnv;
	logger: AutumnLogger;
	onAction?: (message: string) => Promise<void> | void;
	onActionKeyed?: KeyedActionLogger;
	onThinking?: () => void;
	onTurnEnd?: (
		turn: SessionTurnOutcome,
	) => Promise<"continue" | "stop"> | "continue" | "stop";
	orgId: string;
	sessionId: string;
	span?: Span;
}) => {
	// The agent previews then writes in one turn (per the system prompt); capture
	// the latest preview result so the approval card shows the cost.
	let lastPreview: { preview: unknown; previewTool: string } | undefined;
	const driveTurn = ({
		content,
		span,
	}: {
		content: UserMessageContentBlock[];
		span?: Span;
	}) => {
		const openToolSpans = new Map<string, Span>();
		return driveSessionTurn({
			autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
			client,
			kickoff: () =>
				client.beta.sessions.events.send(sessionId, {
					events: [{ content, type: "user.message" }],
				}),
			onAutumnTool: async ({ id, input, name }) => {
				logger.info("Calling Autumn MCP tool", {
					event: "leaf.mcp_tool_called",
					tool: name,
				});
				if (!isSilentTool(name)) {
					await onAction?.(formatToolAction({ args: input, toolName: name }));
				}
				if (span) {
					openToolSpans.set(
						id,
						span.startSpan({ event: { input }, name, type: "tool" }),
					);
				}
			},
			onAutumnToolResult: ({ id, name, output }) => {
				if (isPreviewTool(name) && !isToolErrorResult(output)) {
					lastPreview = {
						preview: output,
						previewTool: normalizeToolName(name),
					};
				}
				const toolSpan = openToolSpans.get(id);
				if (toolSpan) {
					toolSpan.log({ output });
					toolSpan.end();
					openToolSpans.delete(id);
				}
			},
			onSandboxTool: async ({ input, name }) => {
				const command = typeof input.command === "string" ? input.command : "";
				const seconds = Number(command.match(SLEEP_COMMAND_REGEX)?.[1] ?? 0);
				if (seconds >= SURFACED_SLEEP_MIN_SECONDS) {
					await onActionKeyed?.({
						key: "sandbox_wait",
						message: `Waiting ${seconds}s before retrying…`,
					});
					return;
				}
				// Surface other sandbox tools (e.g. `read` loading a skill) live.
				await onAction?.(sandboxToolLabel(name, input));
			},
			onThinking,
			onSessionRetry: async ({ message }) => {
				logger.warn("Claude Managed session retrying", {
					event: "leaf.claude_managed_session_retrying",
					context: { env, org_id: orgId },
					data: { message },
				});
				await onActionKeyed?.({
					key: "session_retry",
					message: `Transient Anthropic error — retrying (${message})`,
				});
			},
			onToolError: async ({ name, output }) => {
				const message = shortErrorMessage(output);
				logger.warn("MCP tool returned an error", {
					event: "leaf.mcp_tool_errored",
					context: { env, org_id: orgId },
					tool: name,
					data: { message },
				});
				await onActionKeyed?.({
					key: `tool_error:${name}:${message}`,
					message: `⚠️ ${toolLabel(name)} failed: ${message}`,
				});
			},
			onTurnEnd,
			sessionId,
		});
	};

	const driveTurnWithInterruptRetry = async ({
		content,
		span,
	}: {
		content: UserMessageContentBlock[];
		span?: Span;
	}) => {
		try {
			return await driveTurn({ content, span });
		} catch (error) {
			if (!isWaitingOnSessionResponseError(error)) throw error;
			logger.warn("Interrupting blocked Claude Managed session", {
				event: "leaf.claude_managed_session_interrupted",
				context: { env, org_id: orgId },
			});
			await interruptSession({ client, sessionId });
			return await driveTurn({ content, span });
		}
	};

	const outcome = await driveTurnWithInterruptRetry({ content, span });

	// Attach the captured preview to the suspended write so the card shows cost.
	const suspended = outcome.suspendedQueue?.[0];
	if (
		suspended &&
		lastPreview &&
		writeToPreviewTool(suspended.toolName) === lastPreview.previewTool
	) {
		suspended.preview = lastPreview.preview;
	}
	return outcome;
};
