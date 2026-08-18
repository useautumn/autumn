import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";
import { resumeApproval } from "./resumeApproval.js";

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

	let result: ApprovalRunResult;
	try {
		result = await resumeApproval({
			approval,
			providerUserId,
		});
	} catch (error) {
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
