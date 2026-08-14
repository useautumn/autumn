import Anthropic from "@anthropic-ai/sdk";
import type { ChatApproval } from "@autumn/shared";
import type { ApprovalGroupRunResult } from "../../internal/approvals/types.js";
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

/** Keeps the asker's suspended session usable after out-of-band approvals. */
const notifySuspendedToolsDenied = async ({
	providerUserId,
	sessionId,
	toolUseIds,
}: {
	providerUserId: string;
	sessionId: string;
	toolUseIds: string[];
}) => {
	try {
		await driveSessionTurn({
			autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
			client,
			kickoff: () =>
				client.beta.sessions.events.send(sessionId, {
					events: toolUseIds.map((toolUseId) => ({
						deny_message:
							"This approval was applied using the approver's Autumn permissions.",
						result: "deny" as const,
						tool_use_id: toolUseId,
						type: "user.tool_confirmation" as const,
					})),
				}),
			sessionId,
		});
	} catch (error) {
		logger.warn("Could not notify suspended Claude Managed tools", {
			event: "leaf.approval_clear_suspended_tool_failed",
			data: {
				session_id: sessionId,
				tool_use_ids: toolUseIds,
				provider_user_id: providerUserId,
			},
			error,
		});
	}
};

const defaultResumeDeps = {
	executeTool: executeAutumnMcpTool,
	findSessionToolResult,
	notifySuspendedToolsDenied,
	driveSessionTurn,
};

type ResumeClaudeManagedApprovalInput = {
	approvals: ChatApproval[];
	deps?: typeof defaultResumeDeps;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	approverToken?: string;
};

type ResumeBranchInput = Required<
	Pick<
		ResumeClaudeManagedApprovalInput,
		"approvals" | "deps" | "providerUserId"
	>
> & {
	onProgress?: (statusLine: string) => void;
	sessionId: string;
	toolUseIds: string[];
};

/**
 * Runs each tool under the approver's own token, then releases the asker's
 * suspended session via a deny so it stays usable. Stops at the first failure
 * so a bad state can't compound across the rest of the group.
 */
const runOutOfBandApprovals = async ({
	approvals,
	approverToken,
	deps,
	onProgress,
	providerUserId,
	sessionId,
	toolUseIds,
}: ResumeBranchInput & {
	approverToken: string;
}): Promise<ApprovalGroupRunResult> => {
	const results: Record<string, unknown> = {};
	let failure: ApprovalGroupRunResult | undefined;
	for (const approval of approvals) {
		onProgress?.(toolStatusLine(approval.tool_name));
		try {
			const result = await deps.executeTool({
				env: approval.env,
				token: approverToken,
				toolName: approval.tool_name,
				args: approval.tool_args,
			});
			if (isErrorResult(result)) {
				failure = approvalErrorResult(result);
				break;
			}
			results[approval.id] = result;
		} catch (error) {
			failure = approvalErrorResult(error);
			break;
		}
	}
	await deps.notifySuspendedToolsDenied({
		providerUserId,
		sessionId,
		toolUseIds,
	});
	return failure ?? { results, text: "" };
};

/** Replays the approver's allows into the asker's own suspended session. */
const resumeSuspendedApprovals = async ({
	approvals,
	deps,
	onProgress,
	sessionId,
	toolUseIds,
}: ResumeBranchInput): Promise<ApprovalGroupRunResult> => {
	const outcome = await deps.driveSessionTurn({
		autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
		client,
		// The tool_uses were emitted in the suspended turn, so seed them here to
		// capture their results in this resume turn.
		expectedToolResults: approvals.map((approval) => ({
			toolName: approval.tool_name,
			toolUseId: approval.tool_call_id as string,
		})),
		kickoff: () =>
			client.beta.sessions.events.send(sessionId, {
				events: toolUseIds.map((toolUseId) => ({
					result: "allow" as const,
					tool_use_id: toolUseId,
					type: "user.tool_confirmation" as const,
				})),
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

	const results: Record<string, unknown> = {};
	const missing: ChatApproval[] = [];
	for (const approval of approvals) {
		// Match by toolUseId — a bare `.at(-1)` could bind another tool's output.
		const writeResult = outcome.toolResults?.find(
			(result) => result.id === approval.tool_call_id,
		);
		if (writeResult) {
			if (isErrorResult(writeResult.output)) {
				return approvalErrorResult(writeResult.output);
			}
			results[approval.id] = writeResult.output;
			continue;
		}
		missing.push(approval);
	}

	// Recover from session history so a crash after a write isn't misreported
	// as a failure and retried into a double-write.
	for (const approval of missing) {
		const recovered = await deps.findSessionToolResult({
			client,
			sessionId,
			toolUseId: approval.tool_call_id as string,
		});
		if (!recovered) continue;
		if (isErrorResult(recovered.output)) {
			return approvalErrorResult(recovered.output);
		}
		results[approval.id] = recovered.output;
	}

	// The captured write results are the source of truth, even if the session
	// crashed after the writes (that's just noise).
	if (Object.keys(results).length === approvals.length) {
		return { results, text };
	}
	// A write is missing everywhere — it never ran, so the group stays retryable.
	if (outcome.errorMessage) {
		return approvalErrorResult(outcome.errorMessage, { retryable: true });
	}
	return approvalErrorResult(
		"The write did not complete — no tool result was returned.",
		{ retryable: true },
	);
};

/** Resumes an approved Claude Managed group; finalization stays in
 * resolveApprovalGroup. */
export const resumeClaudeManagedApprovalGroup = async ({
	approvals,
	deps = defaultResumeDeps,
	onProgress,
	providerUserId,
	approverToken,
}: ResumeClaudeManagedApprovalInput): Promise<ApprovalGroupRunResult> => {
	const sessionId = approvals[0]?.run_id;
	const toolUseIds = approvals.map((approval) => approval.tool_call_id);
	if (!sessionId || toolUseIds.some((toolUseId) => !toolUseId)) {
		throw new Error("Approval is missing the session or tool-call id");
	}
	const branchInput = {
		approvals,
		deps,
		onProgress,
		providerUserId,
		sessionId,
		toolUseIds: toolUseIds as string[],
	};
	return approverToken
		? runOutOfBandApprovals({ ...branchInput, approverToken })
		: resumeSuspendedApprovals(branchInput);
};
