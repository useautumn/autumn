import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { env } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { APPROVAL_SESSION_GONE_MESSAGE } from "../../../ui/messages.js";
import { EveSessionGoneError } from "../../agentRuntime/eve/client.js";
import {
	deleteEveSession,
	getEveSessionBySessionId,
} from "../../agentRuntime/eve/repo.js";
import { surfaceRendersGroup } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalRunResult, SubmittedApprovalResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";
import { executeApprovalSteps } from "./executeApprovalSteps.js";
import { resumeApproval } from "./resumeApproval.js";

const dropEveSession = async ({ approval }: { approval: ChatApproval }) => {
	if (!approval.run_id) return;
	const session = await getEveSessionBySessionId({
		db,
		orgId: approval.org_id,
		sessionId: approval.run_id,
	});
	if (!session) return;
	await deleteEveSession({
		db,
		env: session.env,
		orgId: approval.org_id,
		sessionId: session.sessionId,
		threadKey: session.threadKey,
	});
};

const releaseClaim = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}) => {
	try {
		await chatApprovalRepo.release({
			approvalId: approval.id,
			db,
			providerUserId,
		});
	} catch (error) {
		logger.error("[chat] Could not release approval claim", error, {
			event: "leaf.approval_release_failed",
			approval_id: approval.id,
		});
	}
};

/** Deterministic executor gate: flag-controlled (default on outside
 * production) and Slack-surface-only — the dashboard shows a group's primary
 * write alone, so it must never execute the whole group. */
const approvalExecutorEnabled = ({ provider }: { provider: string }) => {
	const flag =
		env.LEAF_APPROVAL_EXECUTOR ??
		(process.env.NODE_ENV === "production" ? "0" : "1");
	return flag === "1" && surfaceRendersGroup(provider);
};

export const resolveApproval = async ({
	approval,
	onResumed,
	providerUserId,
}: {
	approval: ChatApproval;
	/** Resumed-turn outcome arriving after an executor approve (async). */
	onResumed?: (result: ApprovalRunResult) => Promise<void> | void;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	if (approval.harness && approval.harness !== "eve") {
		logger.error("[chat] Unsupported legacy approval harness", undefined, {
			event: "leaf.approval_no_resumer",
			approval_id: approval.id,
			data: { harness: approval.harness },
		});
		return approvalErrorResult(
			new Error(`Unsupported legacy approval harness "${approval.harness}"`),
		);
	}

	if (approvalExecutorEnabled({ provider: approval.provider ?? "" })) {
		try {
			const executed = await executeApprovalSteps({
				approval,
				onResumed,
				providerUserId,
			});
			if (executed) return executed;
		} catch (error) {
			// Nothing has executed when this throws (token mint / step listing),
			// so releasing the claim is safe.
			logger.error("[chat] Approval executor failed before executing", error, {
				event: "leaf.approval_executor_failed",
				approval_id: approval.id,
			});
			await releaseClaim({ approval, providerUserId });
			return approvalErrorResult(error, { retryable: true });
		}
	}

	let result: SubmittedApprovalResult;
	try {
		result = await resumeApproval({
			approval,
			providerUserId,
		});
	} catch (error) {
		if (error instanceof EveSessionGoneError) {
			// Eve lost the session this card belongs to; no retry can run it, and
			// leaving it pending would block the thread behind a dead card.
			logger.error("[chat] Approval session is gone", error, {
				event: "leaf.approval_session_gone",
				approval_id: approval.id,
			});
			await chatApprovalRepo.finalize({
				approvalId: approval.id,
				db,
				providerUserId,
				status: "failed",
			});
			await dropEveSession({ approval });
			return {
				error: true,
				message: APPROVAL_SESSION_GONE_MESSAGE,
				retryable: false,
			};
		}
		// A thrown resumer error means the write never ran — release the claim so
		// the row returns to pending and the card stays clickable.
		logger.error("[chat] Approval run failed", error, {
			event: "leaf.approval_run_failed",
			approval_id: approval.id,
		});
		await releaseClaim({ approval, providerUserId });
		return approvalErrorResult(error, { retryable: true });
	}

	// Retryable errors return the row to pending; everything else is finalized.
	if ("error" in result && result.retryable) {
		await releaseClaim({ approval, providerUserId });
	} else {
		await chatApprovalRepo.finalize({
			approvalId: approval.id,
			db,
			providerUserId,
			status: "error" in result ? "failed" : "approved",
		});
	}
	return result;
};
