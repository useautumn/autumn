import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
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
import { executeApprovalWrites } from "./executeApprovalWrites.js";
import { guardApprovalDrift } from "./guardApprovalDrift.js";
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
		reason: "approval_session_gone",
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

/** Dead-session fallback, reached only after guardApprovalDrift passed in this
 * same resolve — Slack-only, since only a surface that rendered the group may
 * execute it. */
const executeWithoutSession = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult | undefined> => {
	if (!surfaceRendersGroup(approval.provider ?? "")) return undefined;
	try {
		return await executeApprovalWrites({ approval, providerUserId });
	} catch (error) {
		logger.error("[chat] Dead-session write execution failed", error, {
			event: "leaf.approval_executor_failed",
			approval_id: approval.id,
		});
		return undefined;
	}
};

export const resolveApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
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

	if (surfaceRendersGroup(approval.provider ?? "")) {
		try {
			const drifted = await guardApprovalDrift({ approval, providerUserId });
			if (drifted) return drifted;
		} catch (error) {
			// Nothing has executed when the guard throws (token mint / preview
			// fetch), so releasing the claim is safe.
			logger.error("[chat] Approval drift guard failed", error, {
				event: "leaf.approval_drift_guard_failed",
				approval_id: approval.id,
			});
			await releaseClaim({ approval, providerUserId });
			return approvalErrorResult(error, { retryable: true });
		}
	}
	if (!approval.tool_call_id) {
		const executed = await executeWithoutSession({
			approval,
			providerUserId,
		});
		if (executed) return executed;
	}

	let result: SubmittedApprovalResult;
	try {
		result = await resumeApproval({
			approval,
			providerUserId,
		});
	} catch (error) {
		if (error instanceof EveSessionGoneError) {
			// Eve lost the session this card belongs to; the deterministic
			// executor still honors the approval from the stored writes.
			logger.error("[chat] Approval session is gone", error, {
				event: "leaf.approval_session_gone",
				approval_id: approval.id,
			});
			await dropEveSession({ approval });
			const executed = await executeWithoutSession({
				approval,
				providerUserId,
			});
			if (executed) return executed;
			await chatApprovalRepo.finalize({
				approvalId: approval.id,
				db,
				providerUserId,
				status: "failed",
			});
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
