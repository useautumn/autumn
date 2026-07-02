import Anthropic from "@anthropic-ai/sdk";
import type { ChatApproval } from "@autumn/shared";
import type { ApprovalRunResult } from "../../internal/approvals/types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../internal/approvals/utils/approvalErrors.js";
import {
	errorStatusLine,
	toolStatusLine,
} from "../../internal/approvals/utils/approvalProgress.js";
import { executeAutumnMcpTool } from "../../internal/autumnMcp/client.js";
import { logger } from "../../lib/logger.js";
import { claudeManagedConfig } from "./config.js";
import { driveSessionTurn } from "./session/driveSessionTurn.js";
import { findSessionToolResult } from "./session/findSessionToolResult.js";

const client = new Anthropic();

/** Keeps the asker's suspended session usable after an out-of-band approval. */
const notifySuspendedToolDenied = async ({
	providerUserId,
	sessionId,
	toolUseId,
}: {
	providerUserId: string;
	sessionId: string;
	toolUseId: string;
}) => {
	try {
		await driveSessionTurn({
			autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
			client,
			kickoff: () =>
				client.beta.sessions.events.send(sessionId, {
					events: [
						{
							deny_message:
								"This approval was applied using the approver's Autumn permissions.",
							result: "deny",
							tool_use_id: toolUseId,
							type: "user.tool_confirmation",
						},
					],
				}),
			sessionId,
		});
	} catch (error) {
		logger.warn("Could not notify suspended Claude Managed tool", {
			event: "leaf.approval_clear_suspended_tool_failed",
			data: {
				session_id: sessionId,
				tool_use_id: toolUseId,
				provider_user_id: providerUserId,
			},
			error,
		});
	}
};

const defaultResumeDeps = {
	executeTool: executeAutumnMcpTool,
	findSessionToolResult,
	notifySuspendedToolDenied,
	driveSessionTurn,
};

type ResumeClaudeManagedApprovalWithDepsInput = {
	approval: ChatApproval;
	deps?: typeof defaultResumeDeps;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	approverToken?: string;
};

/** Resumes an approved Claude Managed write; finalization stays in resolveApproval. */
export const resumeClaudeManagedApprovalWithDeps = async ({
	approval,
	deps = defaultResumeDeps,
	onProgress,
	providerUserId,
	approverToken,
}: ResumeClaudeManagedApprovalWithDepsInput): Promise<ApprovalRunResult> => {
	const sessionId = approval.run_id;
	const toolUseId = approval.tool_call_id;
	if (!(sessionId && toolUseId)) {
		throw new Error("Approval is missing the session or tool-call id");
	}
	// Per-user approvals run the tool out-of-band under the approver's own token,
	// then release the asker's suspended session via a deny so it stays usable.
	if (approverToken) {
		onProgress?.(toolStatusLine(approval.tool_name));
		try {
			const result = await deps.executeTool({
				env: approval.env,
				token: approverToken,
				toolName: approval.tool_name,
				args: approval.tool_args,
			});
			const runResult = isErrorResult(result)
				? approvalErrorResult(result)
				: { result, text: "", toolName: approval.tool_name };
			await deps.notifySuspendedToolDenied({
				providerUserId,
				sessionId,
				toolUseId,
			});
			return runResult;
		} catch (error) {
			return approvalErrorResult(error);
		}
	}
	const outcome = await deps.driveSessionTurn({
		autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
		client,
		// The tool_use was emitted in the suspended turn, so seed it here to
		// capture its result in this resume turn.
		expectedToolResult: { toolName: approval.tool_name, toolUseId },
		kickoff: () =>
			client.beta.sessions.events.send(sessionId, {
				events: [
					{
						result: "allow",
						tool_use_id: toolUseId,
						type: "user.tool_confirmation",
					},
				],
			}),
		onAutumnTool: ({ name }) => {
			onProgress?.(toolStatusLine(name));
		},
		onAutumnToolResult: ({ output }) => {
			const errorLine = errorStatusLine(output);
			if (errorLine) onProgress?.(errorLine);
		},
		sessionId,
	});
	const text = outcome.textParts.join("\n\n");
	// Match by toolUseId — a bare `.at(-1)` could bind another tool's output.
	let writeResult = outcome.toolResults?.find(
		(result) => result.id === toolUseId,
	);

	// Recover from session history so a crash after the write isn't misreported
	// as a failure and retried into a double-write.
	if (!writeResult) {
		const recovered = await deps.findSessionToolResult({
			client,
			sessionId,
			toolUseId,
		});
		if (recovered) {
			writeResult = {
				id: toolUseId,
				name: approval.tool_name,
				output: recovered.output,
			};
		}
	}

	// The captured write result is the source of truth, even if the session
	// crashed after the write (that's just noise).
	if (writeResult) {
		if (isErrorResult(writeResult.output)) {
			return approvalErrorResult(writeResult.output);
		}
		return { result: writeResult.output, text, toolName: writeResult.name };
	}
	// No result anywhere — the write never ran, so the approval stays retryable.
	if (outcome.errorMessage) {
		return approvalErrorResult(outcome.errorMessage, { retryable: true });
	}
	return approvalErrorResult(
		"The write did not complete — no tool result was returned.",
		{ retryable: true },
	);
};
