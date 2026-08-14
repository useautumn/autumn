import { discardApproval } from "../../../internal/approvals/actions/discardApproval.js";
import { resolveApproval } from "../../../internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";

type WebApprovalDecision =
	| { status: "approved"; text: string }
	| { status: "rejected"; text?: string }
	| { error: string };

export const decideWebApproval = async ({
	action,
	approvalId,
	orgId,
	providerUserId,
}: {
	action: "approve" | "reject";
	approvalId: string;
	orgId: string;
	providerUserId: string;
}): Promise<WebApprovalDecision> => {
	const approval = await chatApprovalRepo.get({ approvalId, db });
	if (!approval || approval.org_id !== orgId) {
		return { error: "Approval not found" };
	}
	if (approval.status !== "pending") {
		return { error: `Approval already ${approval.status}` };
	}

	if (action === "reject") {
		// Deny Eve remotely so discarded writes cannot resume later.
		let text: string | undefined;
		if (approval.harness === "eve") {
			// Always cancel locally even if the remote denial fails.
			try {
				const denied = await discardApproval({ approval, providerUserId });
				if ("error" in denied && denied.error) {
					logger.warn("Could not deny Eve approval on reject", {
						event: "leaf.eve_reject_deny_failed",
						approval_id: approvalId,
						data: { message: denied.message },
					});
				} else if ("text" in denied) {
					text = denied.text;
				}
			} catch (error) {
				logger.warn("Could not deny Eve approval on reject", {
					event: "leaf.eve_reject_deny_failed",
					approval_id: approvalId,
					error,
				});
			}
		}
		await chatApprovalRepo.cancel({ approvalId, db, providerUserId });
		return { status: "rejected", text };
	}

	const result = await resolveApproval({ approval, providerUserId });
	if ("error" in result) {
		return { error: result.message };
	}
	return { status: "approved", text: result.text };
};
