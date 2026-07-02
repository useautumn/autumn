import type { ChatApproval } from "@autumn/shared";
import type { AgentHarnessName } from "../../../lib/chatAgentConfig.js";
import { db } from "../../../lib/db.js";
import { env as chatEnv } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { approvalRuntimes } from "../runtimes.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";

// Routes an approval to the resumer for the harness that produced it (falling
// back to the configured harness for pre-column rows), then finalizes the row.
export const resolveApproval = async ({
	approval,
	onProgress,
	providerUserId,
	approverToken,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	approverToken?: string;
}): Promise<ApprovalRunResult> => {
	const harness =
		(approval.harness as AgentHarnessName | null) ??
		chatEnv.SLACK_AGENT_HARNESS;
	const resume = approvalRuntimes[harness];
	if (!resume) {
		// Config error, not transient — fail terminally so it doesn't retry forever.
		logger.error("[chat] No approval resumer for harness", undefined, {
			event: "leaf.approval_no_resumer",
			approval_id: approval.id,
			data: { harness },
		});
		return approvalErrorResult(
			new Error(`No approval resumer for harness "${harness}"`),
		);
	}

	let result: ApprovalRunResult;
	try {
		result = await resume({ approval, onProgress, providerUserId, approverToken });
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
