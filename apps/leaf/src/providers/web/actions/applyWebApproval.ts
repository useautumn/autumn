import { executeApprovalSteps } from "../../../internal/approvals/actions/executeApprovalSteps.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { settleCardRemotely } from "../../../internal/approvals/surfaces/slack/settleCardRemotely.js";
import type { ApprovalStepOutcome } from "../../../internal/approvals/types.js";
import { assertDecidableApproval } from "../../../internal/approvals/utils/assertDecidableApproval.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { getWebApproval } from "./getWebApproval.js";

export type ApplyWebApprovalResult =
	| { applied: true; steps: ReadonlyArray<ApprovalStepOutcome> }
	| {
			applied: false;
			code:
				| "drifted"
				| "failed"
				| "not_applicable"
				| "not_found"
				| "org_mismatch"
				| "already_decided";
			message?: string;
			steps?: ReadonlyArray<ApprovalStepOutcome>;
	  };

/** Dashboard apply: executes the approval's stored steps (same deterministic
 * executor as Slack) and settles the Slack card remotely. Only single-step
 * sheet-renderable approvals qualify — the sheet showed the whole "group". */
export const applyWebApproval = async ({
	approvalId,
	orgId,
	userId,
}: {
	approvalId: string;
	orgId: string;
	userId: string;
}): Promise<ApplyWebApprovalResult> => {
	const detail = await getWebApproval({ approvalId, orgId, userId });
	if ("error" in detail) {
		return { applied: false, code: detail.error.code };
	}
	if (!detail.approval.can_apply) {
		return {
			applied: false,
			code:
				detail.approval.status === "pending"
					? "not_applicable"
					: "already_decided",
		};
	}

	const claimed = await chatApprovalRepo.claim({
		approvalId,
		db,
		providerUserId: userId,
	});
	if (!claimed) return { applied: false, code: "already_decided" };
	const decidable = assertDecidableApproval({ approval: claimed });
	if (!decidable.decidable && claimed.status === "pending") {
		await chatApprovalRepo.release({ approvalId, db, providerUserId: userId });
		return { applied: false, code: "already_decided" };
	}

	const result = await executeApprovalSteps({
		approval: claimed,
		providerUserId: userId,
	});
	if (!result) {
		await chatApprovalRepo.release({ approvalId, db, providerUserId: userId });
		return { applied: false, code: "not_applicable" };
	}
	if ("drifted" in result) {
		return { applied: false, code: "drifted", message: result.message };
	}

	const settled = await chatApprovalRepo.get({ approvalId, db });
	if (settled) {
		void settleCardRemotely({
			approval: settled,
			status: "error" in result ? "failed" : "approved",
			statusLine: "Decided from the dashboard",
			steps: "steps" in result ? result.steps : undefined,
		});
	}
	logger.info("Applied approval from dashboard", {
		event: "leaf.approval_applied_from_dashboard",
		approval_id: approvalId,
		data: { failed: "error" in result, org_id: orgId },
	});

	if ("error" in result) {
		return {
			applied: false,
			code: "failed",
			message: result.message,
			steps: result.steps,
		};
	}
	return { applied: true, steps: result.steps ?? [] };
};
