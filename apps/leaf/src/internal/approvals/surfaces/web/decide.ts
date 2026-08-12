import { denyEveApprovalGroup } from "../../../../harness/eve/approval.js";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { resolveApprovalGroup } from "../../actions/resolveApprovalGroup.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

export type WebApprovalDecision =
	| { status: "approved"; text: string }
	| { status: "rejected"; text?: string }
	| { error: string };

/**
 * Resolve a web approval. Approve resumes the suspended turn (the writes run)
 * and returns its continuation text for the dashboard to append; reject cancels
 * the pending rows.
 *
 * Decides the whole group the row belongs to: the agent gated these writes
 * together and the session resumes on the first answer, so deciding one alone
 * would leave its siblings parked forever.
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
	const approvals = await chatApprovalRepo.getGroup({ approvalId, db });
	const [first] = approvals;
	if (!first || first.org_id !== orgId) {
		return { error: "Approval not found" };
	}
	const pending = approvals.filter((approval) => approval.status === "pending");
	if (pending.length === 0) {
		return { error: `Approval already ${first.status}` };
	}

	if (action === "reject") {
		// Eve parks the whole turn on the approvals — deny them in the session
		// too, or it keeps waiting, holds the user's next message behind the stale
		// approvals, and the discarded writes can still run later.
		let text: string | undefined;
		if (first.harness === "eve") {
			// The local cancel below must run even if the remote deny throws, or
			// the approvals stay pending and the dashboard keeps showing them.
			try {
				const denied = await denyEveApprovalGroup({
					approvals: pending,
					providerUserId,
				});
				if ("error" in denied && denied.error) {
					logger.warn("Could not deny Eve approvals on reject", {
						event: "leaf.eve_reject_deny_failed",
						approval_id: approvalId,
						data: { message: denied.message },
					});
				} else if ("text" in denied) {
					text = denied.text;
				}
			} catch (error) {
				logger.warn("Could not deny Eve approvals on reject", {
					event: "leaf.eve_reject_deny_failed",
					approval_id: approvalId,
					error,
				});
			}
		}
		await chatApprovalRepo.cancelGroup({
			approvals: pending,
			db,
			providerUserId,
		});
		return { status: "rejected", text };
	}

	const result = await resolveApprovalGroup({
		approvals: pending,
		providerUserId,
	});
	if ("error" in result) {
		return { error: result.message };
	}
	return { status: "approved", text: result.text };
};
