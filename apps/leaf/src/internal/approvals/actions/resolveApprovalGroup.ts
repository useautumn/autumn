import type { ChatApproval } from "@autumn/shared";
import type { AgentHarnessName } from "../../../lib/chatAgentConfig.js";
import { db } from "../../../lib/db.js";
import { env as chatEnv } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { approvalRuntimes } from "../runtimes.js";
import type { ApprovalGroupRunResult } from "../types.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";

// Routes a group to the resumer for the harness that produced it (falling back
// to the configured harness for pre-column rows), then finalizes the rows.
export const resolveApprovalGroup = async ({
	approvals,
	onProgress,
	providerUserId,
	approverToken,
}: {
	approvals: ChatApproval[];
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	approverToken?: string;
}): Promise<ApprovalGroupRunResult> => {
	const [first] = approvals;
	if (!first) {
		return approvalErrorResult(new Error("No approvals to resolve"));
	}
	const harness =
		(first.harness as AgentHarnessName | null) ?? chatEnv.SLACK_AGENT_HARNESS;
	const resume = approvalRuntimes[harness];
	if (!resume) {
		// Config error, not transient — fail terminally so it doesn't retry forever.
		logger.error("[chat] No approval resumer for harness", undefined, {
			event: "leaf.approval_no_resumer",
			approval_id: first.id,
			data: { harness },
		});
		return approvalErrorResult(
			new Error(`No approval resumer for harness "${harness}"`),
		);
	}

	let result: ApprovalGroupRunResult;
	try {
		result = await resume({
			approvals,
			onProgress,
			providerUserId,
			approverToken,
		});
	} catch (error) {
		// A thrown resumer error means the writes never ran — keep the group
		// pending so the user can retry.
		logger.error("[chat] Approval run failed", error, {
			event: "leaf.approval_run_failed",
			approval_id: first.id,
			data: { group_size: approvals.length },
		});
		return approvalErrorResult(error, { retryable: true });
	}

	// A retryable error means the writes never ran, so hand the group back to
	// pending — leaving it claimed would make the promised retry unclaimable.
	if ("error" in result && result.retryable) {
		await chatApprovalRepo.releaseGroup({ approvals, db, providerUserId });
		return result;
	}

	const finalized = await chatApprovalRepo.finalizeGroup({
		approvals,
		db,
		providerUserId,
		status: "error" in result ? "failed" : "approved",
	});
	// The writes already ran, so a short stamp means the claim was lost mid-run
	// and some rows now read as something other than what actually happened.
	if (finalized.length !== approvals.length) {
		logger.warn("[chat] Approval group finalized short", {
			event: "leaf.approval_finalize_short",
			approval_id: first.id,
			data: { finalized: finalized.length, expected: approvals.length },
		});
	}
	return result;
};
