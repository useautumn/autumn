import type { ChatApproval } from "@autumn/shared";
import type { AgentHarnessName } from "../../../lib/chatAgentConfig.js";
import { db } from "../../../lib/db.js";
import { env as chatEnv } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { harnessApprovalResumers } from "../harnessApprovalResumers.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";

// Routes an approval to the resumer for the harness that produced it (falling
// back to the configured harness for pre-column rows), then finalizes the row.
export const approveAndRun = async ({
	approval,
	onProgress,
	providerUserId,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	const harness =
		(approval.harness as AgentHarnessName | null) ??
		chatEnv.SLACK_AGENT_HARNESS;
	const resume = harnessApprovalResumers[harness];

	let result: ApprovalRunResult;
	try {
		if (!resume) {
			throw new Error(`No approval resumer for harness "${harness}"`);
		}
		result = await resume({ approval, onProgress, providerUserId });
	} catch (error) {
		logger.error("[chat] Approval run failed", error, {
			event: "leaf.approval_run_failed",
			approval_id: approval.id,
		});
		await chatApprovalRepo.finalize({
			approvalId: approval.id,
			db,
			providerUserId,
			status: "failed",
		});
		return approvalErrorResult(error);
	}

	await chatApprovalRepo.finalize({
		approvalId: approval.id,
		db,
		providerUserId,
		status: "error" in result ? "failed" : "approved",
	});
	return result;
};
