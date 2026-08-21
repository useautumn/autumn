import type { ChatApproval, ChatApprovalStep } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import {
	normalizeToolName,
	toolLabel,
} from "../../agentRuntime/tools/toolPolicy.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { denyOptionOf } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../repos/chatApprovalStepsRepo.js";
import type { ApprovalRunResult, ApprovalStepOutcome } from "../types.js";
import { withStepPreviews } from "../utils/fetchApprovalPreview.js";
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

type ExecutedStep = {
	outcome: WriteExecutionOutcome | { status: "skipped" };
	step: ChatApprovalStep;
};

/** Re-previews every step and compares money facts against what the card
 * showed. Fail closed: an unfetchable preview counts as drifted. */
const detectPreviewDrift = async ({
	env,
	steps,
	token,
}: {
	env: ChatApproval["env"];
	steps: ReadonlyArray<ChatApprovalStep>;
	token: string;
}) => {
	const checkable = steps.filter(
		(step) => step.preview && writeToPreviewTool(step.tool_name),
	);
	if (!checkable.length) return { drifted: false as const };
	const fresh = await withStepPreviews({
		env,
		getToken: async () => token,
		logger,
		steps: checkable.map((step) => ({
			input: step.tool_args,
			requestId: step.request_id ?? "",
			toolName: step.tool_name,
		})),
	});
	const drifted = checkable.some(
		(step, index) =>
			previewMoneyFactsDrifted({
				current: fresh[index]?.preview,
				stored: step.preview,
			}).drifted,
	);
	return {
		drifted,
		refresh: async () => {
			await Promise.all(
				checkable.map(async (step, index) => {
					await chatApprovalStepsRepo.setPreview({
						approvalId: step.approval_id,
						db,
						preview: fresh[index]?.preview,
						stepId: step.id,
					});
					if (step.position === 0) {
						await chatApprovalRepo.setPreview({
							approvalId: step.approval_id,
							db,
							preview: fresh[index]?.preview,
						});
					}
				}),
			);
		},
	};
};

const executeSteps = async ({
	env,
	steps,
	token,
}: {
	env: ChatApproval["env"];
	steps: ReadonlyArray<ChatApprovalStep>;
	token: string;
}): Promise<ExecutedStep[]> => {
	const executed: ExecutedStep[] = [];
	let stopped = false;
	for (const step of steps) {
		if (stopped) {
			await chatApprovalStepsRepo.setStatus({
				db,
				status: "skipped",
				stepId: step.id,
			});
			executed.push({ outcome: { status: "skipped" }, step });
			continue;
		}
		// The durable running marker splits "never started" from "outcome
		// unknown" if the process dies mid-call.
		await chatApprovalStepsRepo.setStatus({
			db,
			status: "running",
			stepId: step.id,
		});
		const outcome = await executeAutumnMcpTool({
			args: step.tool_args,
			env,
			token,
			toolName: step.tool_name,
		}).then(
			(result) => classifyWriteExecution({ result }),
			(error) => classifyWriteExecution({ error }),
		);
		await chatApprovalStepsRepo.setStatus({
			db,
			result:
				outcome.status === "applied"
					? outcome.result
					: { message: outcome.detail },
			status: outcome.status,
			stepId: step.id,
		});
		executed.push({ outcome, step });
		if (outcome.status !== "applied") stopped = true;
	}
	return executed;
};

const outcomeNote = ({
	executed,
}: {
	executed: ReadonlyArray<ExecutedStep>;
}) => {
	const lines = executed.map(({ outcome, step }) => {
		const label = `${toolLabel(step.tool_name)} (${step.tool_name})`;
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
		"Do NOT re-issue any of these writes, do NOT re-delegate to verify, and NEVER describe an applied write as denied or rejected. Reply to the user with a short summary of these actual outcomes only.",
	].join("\n");
};

const stepOutcomes = (
	executed: ReadonlyArray<ExecutedStep>,
): ApprovalStepOutcome[] =>
	executed.map(({ outcome, step }) => ({
		status: outcome.status,
		toolName: step.tool_name,
	}));

/** Deterministic approve: executes the claimed row's stored steps directly and
 * resumes eve as notification only. Returns undefined for legacy rows without
 * steps, which fall back to the resume-executes path. */
export const executeApprovalSteps = async ({
	approval,
	onResumed,
	providerUserId,
}: {
	approval: ChatApproval;
	/** Receives the resumed turn's outcome (chained parks, questions) once the
	 * async eve notification completes. The model's TEXT is deliberately not
	 * surfaced — the card and step outcomes are the ground truth, and a model
	 * that misreads the procedural denials must not contradict them. */
	onResumed?: (result: ApprovalRunResult) => Promise<void> | void;
	providerUserId: string;
}): Promise<ApprovalRunResult | undefined> => {
	const steps = await chatApprovalStepsRepo.list({
		approvalId: approval.id,
		db,
	});
	if (!steps.length) return undefined;

	const { accessToken } = await getOrgInstallationToken({
		env: approval.env,
		orgId: approval.org_id,
		provider: approval.provider,
		userId: approval.provider === "web" ? providerUserId : undefined,
		workspaceId: approval.workspace_id,
	});

	const drift = await detectPreviewDrift({
		env: approval.env,
		steps,
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
		await drift.refresh?.();
		logger.info("Approval drifted; card refreshed instead of executing", {
			event: "leaf.approval_drift_refreshed",
			approval_id: approval.id,
		});
		return { drifted: true, message: DRIFT_MESSAGE };
	}

	const executed = await executeSteps({
		env: approval.env,
		steps,
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
	logger.info("Executed approved steps", {
		event: "leaf.approval_steps_executed",
		approval_id: approval.id,
		data: {
			outcomes: executed.map(({ outcome, step }) => ({
				status: outcome.status,
				tool: step.tool_name,
			})),
		},
	});

	// Notification only, fired async — execution is already durable and the
	// card must not wait on a model turn; failures (even session-gone) only log.
	const notifyEve = async () => {
		const stepDenyOptions = new Map(
			steps
				.filter((step) => step.request_id && step.deny_option_id)
				.map((step) => [
					step.request_id as string,
					step.deny_option_id as string,
				]),
		);
		const appliedArgs = executed
			.filter(({ outcome }) => outcome.status === "applied")
			.map(({ step }) => ({
				toolArgs: step.tool_args,
				toolName: step.tool_name,
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
					? "This write was already applied by the system when the user approved — do not re-issue it; reply with a short confirmation instead."
					: undefined,
			siblingOptionIdFor: (siblingRequestId) =>
				stepDenyOptions.get(siblingRequestId),
			suppressSiblingWithheldNote: true,
		});
		await onResumed?.(resumed);
	};
	void notifyEve().catch((error) => {
		logger.warn("Could not notify eve after executing approved steps", {
			event: "leaf.approval_notify_failed",
			approval_id: approval.id,
			data: { error },
		});
	});

	if (!allApplied) {
		return {
			error: true,
			message:
				(failedDetail && "detail" in failedDetail
					? failedDetail.detail
					: undefined) ?? "Some steps were not applied.",
			retryable: false,
			steps: stepOutcomes(executed),
		};
	}
	return {
		result: {},
		steps: stepOutcomes(executed),
		text: "",
		toolName: approval.tool_name,
	};
};
