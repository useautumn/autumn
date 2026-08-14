import type { ChatApproval } from "@autumn/shared";
import { resumeEveApproval } from "../../agentRuntime/eve/approval.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";

export const resolveApproval = async ({
	approval,
	onProgress,
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
		result = await resumeEveApproval({
			approval,
			onProgress,
			providerUserId,
		});
	} catch (error) {
		// A thrown resumer error means the write never ran — keep the approval
		// pending so the user can retry.
		logger.error("[chat] Approval run failed", error, {
			event: "leaf.approval_run_failed",
			approval_id: approval.id,
		});
		return approvalErrorResult(error, { retryable: true });
	}

	// Retryable errors leave the row pending; everything else is finalized.
	if (!("error" in result && result.retryable)) {
		await chatApprovalRepo.finalize({
			approvalId: approval.id,
			db,
			providerUserId,
			status: "error" in result ? "failed" : "approved",
		});
	}
	return result;
};
