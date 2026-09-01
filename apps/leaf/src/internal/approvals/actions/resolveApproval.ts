import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { surfaceRendersGroup } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";
import { executeApprovalWrites } from "./executeApprovalWrites.js";
import { guardApprovalDrift } from "./guardApprovalDrift.js";

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

/** Deterministic executor: the card's stored writes are the whole truth, and
 * the agent is never consulted again. */
const executeStoredWrites = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult | undefined> => {
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

	const executed = await executeStoredWrites({ approval, providerUserId });
	if (executed) return executed;

	// The executor only returns undefined when it threw, and nothing ran — the
	// claim goes back so the card stays clickable.
	await releaseClaim({ approval, providerUserId });
	return approvalErrorResult(new Error("Approval writes did not run"), {
		retryable: true,
	});
};
