import Anthropic from "@anthropic-ai/sdk";
import type { ChatApproval } from "@autumn/shared";
import { executeAutumnMcpTool } from "../../internal/autumnMcp/client.js";
import type { ApprovalRunResult } from "../../internal/approvals/types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../internal/approvals/utils/approvalErrors.js";
import {
	errorStatusLine,
	toolStatusLine,
} from "../../internal/approvals/utils/approvalProgress.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { claudeManagedConfig } from "./config.js";
import { cmaRepo } from "./repos/claudeManagedRepo.js";
import { driveSessionTurn } from "./session/driveSessionTurn.js";
import { findSessionToolResult } from "./session/findSessionToolResult.js";

const client = new Anthropic();

const clearSuspendedTool = async ({
	sessionId,
	toolUseId,
}: {
	sessionId: string;
	toolUseId: string;
}) => {
	try {
		await cmaRepo.deleteSessionById({ db, sessionId });
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
		logger.warn("Could not clear approved Claude Managed tool", {
			event: "leaf.approval_clear_suspended_tool_failed",
			data: { session_id: sessionId, tool_use_id: toolUseId },
			error,
		});
	}
};

// Confirms an already-claimed tool in the idle Claude Managed session, then
// returns its write result and any continuation text for the thread reply.
// Finalization is owned by the dispatcher (resolveApproval).
export const resumeClaudeManagedApproval = async ({
	approval,
	onProgress,
	token,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	token?: string;
}): Promise<ApprovalRunResult> => {
	const sessionId = approval.run_id;
	const toolUseId = approval.tool_call_id;
	if (!(sessionId && toolUseId)) {
		throw new Error("Approval is missing the session or tool-call id");
	}
	if (token) {
		onProgress?.(toolStatusLine(approval.tool_name));
		try {
			const result = await executeAutumnMcpTool({
				env: approval.env,
				token,
				toolName: approval.tool_name,
				args: approval.tool_args,
			});
			void clearSuspendedTool({ sessionId, toolUseId });
			return { result, text: "", toolName: approval.tool_name };
		} catch (error) {
			return approvalErrorResult(error);
		}
	}
	const outcome = await driveSessionTurn({
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
	// Only the confirmed tool's own result counts — never another tool's (a bare
	// `.at(-1)` could bind the wrong output). If it's absent, history recovery
	// below looks it up by toolUseId.
	let writeResult = outcome.toolResults?.find(
		(result) => result.id === toolUseId,
	);

	// The live stream can crash after the MCP write ran but before we captured its
	// result. Recover the result from session history so a lost result isn't
	// misreported as a failure (and retried into a double-write).
	if (!writeResult) {
		const recovered = await findSessionToolResult({
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

	// The captured write result is the source of truth. A clean result means the
	// write succeeded — even if the session crashed afterwards (e.g. while
	// generating follow-up text), which is just noise. A captured error result
	// means the tool ran and failed — terminal.
	if (writeResult) {
		if (isErrorResult(writeResult.output)) {
			return approvalErrorResult(writeResult.output);
		}
		return { result: writeResult.output, text, toolName: writeResult.name };
	}
	// No result anywhere — the write never ran. Retryable, so the approval stays
	// pending and the user can apply again.
	if (outcome.errorMessage) {
		return approvalErrorResult(outcome.errorMessage, { retryable: true });
	}
	return approvalErrorResult(
		"The write did not complete — no tool result was returned.",
		{ retryable: true },
	);
};
