import { denyEveApproval } from "../../../../harness/eve/approval.js";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { resolveApproval } from "../../actions/resolveApproval.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

export type WebApprovalDecision =
	| { status: "approved"; text: string }
	| { status: "rejected"; text?: string }
	| { error: string };

/**
 * Resolve a web approval. Approve resumes the suspended turn (the write runs)
 * and returns its continuation text for the dashboard to append; reject cancels
 * the pending row.
 */
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
		// Eve parks the whole turn on the approval — deny it in the session too,
		// or it keeps waiting, holds the user's next message behind the stale
		// approval, and the discarded write can still run later.
		let text: string | undefined;
		if (approval.harness === "eve") {
			// The local cancel below must run even if the remote deny throws, or
			// the approval stays pending and the dashboard keeps showing it.
			try {
				const denied = await denyEveApproval({ approval, providerUserId });
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
