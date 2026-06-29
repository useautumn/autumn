import { db } from "../../../../lib/db.js";
import { resolveApproval } from "../../actions/resolveApproval.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

export type WebApprovalDecision =
	| { status: "approved"; text: string }
	| { status: "rejected" }
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
		await chatApprovalRepo.cancel({ approvalId, db, providerUserId });
		return { status: "rejected" };
	}

	const result = await resolveApproval({ approval, providerUserId });
	if ("error" in result) {
		return { error: result.message };
	}
	return { status: "approved", text: result.text };
};
