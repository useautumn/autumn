import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { errorMessage } from "../../../lib/errorMessage.js";
import { logger } from "../../../lib/logger.js";
import {
	normalizeToolName,
	toolLabel,
} from "../../agentRuntime/tools/toolPolicy.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { denyOptionOf } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import type { ApprovalRunResult, ApprovalWriteOutcome } from "../types.js";
import { withWritePreviews } from "../utils/fetchApprovalPreview.js";
import { previewMoneyFactsDrifted } from "../utils/previewMoneyFacts.js";
import { writeToPreviewTool } from "../utils/toolRegistry.js";
import { isSameToolRequest, publicToolArgs } from "../utils/toolRequest.js";
import {
	classifyWriteExecution,
	type WriteExecutionOutcome,
} from "../utils/writeExecutionResult.js";
import { submitApprovalInput } from "./submitApprovalInput.js";

const DRIFT_MESSAGE =
	"Prices changed since this card was shown — nothing was applied. Review the updated preview and approve again.";

/** Runs one gated write and classifies the result — a throw is a terminal
 * `unknown` (never blindly retried against a billing API). */
const runWrite = async ({
	env,
	token,
	write,
}: {
	env: ChatApproval["env"];
	token: string;
	write: ChatApprovalWrite;
}): Promise<WriteExecutionOutcome> => {
	try {
		const result = await executeAutumnMcpTool({
			args: write.tool_args,
			env,
			token,
			toolName: write.tool_name,
		});
		return classifyWriteExecution({ result });
	} catch (error) {
		return classifyWriteExecution({ error });
	}
};

type ExecutedWrite = {
	outcome: WriteExecutionOutcome | { status: "skipped" };
	write: ChatApprovalWrite;
};

/** Re-previews every write and compares money facts against what the card
 * showed. Fail closed: an unfetchable preview counts as drifted. */
const detectPreviewDrift = async ({
	env,
	writes,
	token,
}: {
	env: ChatApproval["env"];
	writes: ReadonlyArray<ChatApprovalWrite>;
	token: string;
}) => {
	const checkable = writes.filter(
		(write) => write.preview && writeToPreviewTool(write.tool_name),
	);
	if (!checkable.length) return { drifted: false } as const;
	const fresh = await withWritePreviews({
		env,
		getToken: async () => token,
		logger,
		writes: checkable.map((write) => ({
			input: write.tool_args,
			requestId: write.request_id ?? "",
			toolName: write.tool_name,
		})),
	});
	const reason = checkable
		.map((write, index) => {
			const verdict = previewMoneyFactsDrifted({
				current: fresh[index]?.preview,
				stored: write.preview,
			});
			return verdict.drifted ? verdict.reason : undefined;
		})
		.find(Boolean);
	if (!reason) return { drifted: false } as const;
	return {
		drifted: true,
		reason,
		refresh: async () => {
			await Promise.all(
				checkable.map((write, index) =>
					setWritePreviewEverywhere({
						preview: fresh[index]?.preview,
						write,
					}),
				),
			);
		},
	} as const;
};

/** The primary write is mirrored on the parent row for card rendering, so a
 * refreshed preview must land on both copies or they drift apart. */
const setWritePreviewEverywhere = async ({
	preview,
	write,
}: {
	preview: unknown;
	write: ChatApprovalWrite;
}) => {
	await chatApprovalWritesRepo.setPreview({
		approvalId: write.approval_id,
		db,
		preview,
		writeId: write.id,
	});
	if (write.position === 0) {
		await chatApprovalRepo.setPreview({
			approvalId: write.approval_id,
			db,
			preview,
		});
	}
};

const executeWrites = async ({
	env,
	writes,
	token,
}: {
	env: ChatApproval["env"];
	writes: ReadonlyArray<ChatApprovalWrite>;
	token: string;
}): Promise<ExecutedWrite[]> => {
	const executed: ExecutedWrite[] = [];
	let stopped = false;
	for (const write of writes) {
		if (stopped) {
			await chatApprovalWritesRepo.setStatus({
				db,
				status: "skipped",
				writeId: write.id,
			});
			executed.push({ outcome: { status: "skipped" }, write });
			continue;
		}
		// The durable running marker splits "never started" from "outcome
		// unknown" if the process dies mid-call.
		await chatApprovalWritesRepo.setStatus({
			db,
			status: "running",
			writeId: write.id,
		});
		const outcome = await runWrite({ env, token, write: write });
		await chatApprovalWritesRepo.setStatus({
			db,
			result:
				outcome.status === "applied"
					? outcome.result
					: { message: outcome.detail },
			status: outcome.status,
			writeId: write.id,
		});
		executed.push({ outcome, write });
		if (outcome.status !== "applied") stopped = true;
	}
	return executed;
};

const outcomeNote = ({
	executed,
}: {
	executed: ReadonlyArray<ExecutedWrite>;
}) => {
	const lines = executed.map(({ outcome, write }) => {
		const label = `${toolLabel(write.tool_name)} (${write.tool_name})`;
		if (outcome.status === "applied") return `- ${label}: applied`;
		if (outcome.status === "skipped") {
			return `- ${label}: NOT applied (skipped after an earlier failure)`;
		}
		return `- ${label}: ${outcome.status} — ${outcome.detail}`;
	});
	const allApplied = executed.every(
		({ outcome }) => outcome.status === "applied",
	);
	return [
		"SYSTEM NOTE — the deny responses on this batch are PROCEDURAL, not real denials: the user APPROVED the card and the system has already executed the writes directly. The denies only release the paused tool calls.",
		"Your subagent saw only the procedural denials and may report these writes as denied or failed — that report is WRONG and must be ignored. This note is the ground truth:",
		allApplied ? "Every write below is APPLIED and live:" : "Actual outcomes:",
		...lines,
		"Do NOT re-issue any of these writes, do NOT re-delegate to verify, and NEVER describe an applied write as denied or rejected. The approval card in the thread already shows these outcomes — do not reply; end your turn silently.",
	].join("\n");
};

const stepOutcomes = (
	executed: ReadonlyArray<ExecutedWrite>,
): ApprovalWriteOutcome[] =>
	executed.map(({ outcome, write }) => ({
		status: outcome.status,
		toolName: write.tool_name,
	}));

/** Deterministic approve: runs the stored writes, resumes eve as notification
 * only — outcomes are ground truth, the model's text is never surfaced. */
export const executeApprovalWrites = async ({
	approval,
	onResumed,
	providerUserId,
}: {
	approval: ChatApproval;
	onResumed?: (result: ApprovalRunResult) => Promise<void> | void;
	providerUserId: string;
}): Promise<ApprovalRunResult | undefined> => {
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	if (!writes.length) return undefined;

	const { accessToken } = await getOrgInstallationToken({
		env: approval.env,
		orgId: approval.org_id,
		provider: approval.provider,
		workspaceId: approval.workspace_id,
	});

	const drift = await detectPreviewDrift({
		env: approval.env,
		writes,
		token: accessToken,
	});
	if (drift.drifted) {
		// Release first: the preview writers are pending-guarded, so the fresh
		// previews can only land once the row is back in pending.
		await chatApprovalRepo.release({
			approvalId: approval.id,
			db,
			providerUserId,
		});
		await drift.refresh();
		logger.info("Approval drifted; card refreshed instead of executing", {
			event: "leaf.approval_drift_refreshed",
			approval_id: approval.id,
			data: { reason: drift.reason },
		});
		return { drifted: true, message: DRIFT_MESSAGE };
	}

	const executed = await executeWrites({
		env: approval.env,
		writes,
		token: accessToken,
	});
	const allApplied = executed.every(
		({ outcome }) => outcome.status === "applied",
	);
	const failedDetail = executed.find(
		({ outcome }) =>
			outcome.status === "failed" || outcome.status === "unknown",
	)?.outcome;
	await chatApprovalRepo.finalize({
		approvalId: approval.id,
		db,
		providerUserId,
		status: allApplied ? "approved" : "failed",
	});
	logger.info("Executed approved writes", {
		event: "leaf.approval_writes_executed",
		approval_id: approval.id,
		data: {
			outcomes: executed.map(({ outcome, write }) => ({
				status: outcome.status,
				tool: write.tool_name,
			})),
		},
	});

	// Notification only, fired async — execution is already durable and the
	// card must not wait on a model turn; failures (even session-gone) only log.
	const notifyEve = async () => {
		const appliedArgs = executed
			.filter(({ outcome }) => outcome.status === "applied")
			.map(({ write }) => ({
				toolArgs: write.tool_args,
				toolName: write.tool_name,
			}));
		const resumed = await submitApprovalInput({
			approval,
			note: outcomeNote({ executed }),
			optionId: denyOptionOf(approval),
			providerUserId,
			shouldAbsorbChained: ({ input, toolName }) =>
				appliedArgs.some(
					(applied) =>
						normalizeToolName(applied.toolName) ===
							normalizeToolName(toolName) &&
						isSameToolRequest(
							publicToolArgs(applied.toolArgs),
							publicToolArgs(input ?? {}),
						),
				)
					? "This write was already applied by the system when the user approved — do not re-issue it and do not reply; the card already confirms it."
					: undefined,
			suppressSiblingWithheldNote: true,
		});
		await onResumed?.(resumed);
	};
	void notifyEve().catch((error) => {
		logger.warn("Could not notify eve after executing approved writes", {
			event: "leaf.approval_notify_failed",
			approval_id: approval.id,
			data: { error: errorMessage(error) },
		});
	});

	if (!allApplied) {
		return {
			error: true,
			message:
				(failedDetail && "detail" in failedDetail
					? failedDetail.detail
					: undefined) ?? "Some writes were not applied.",
			retryable: false,
			writes: stepOutcomes(executed),
		};
	}
	return {
		result: {},
		writes: stepOutcomes(executed),
		text: "",
		toolName: approval.tool_name,
	};
};
