import { resolveApproval } from "../../../internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { approvalDecidability } from "../../../internal/approvals/utils/approvalDecidability.js";
import { WEB_CHAT_PROVIDER } from "../../../internal/installations/actions/ensureWebChatAuth.js";
import { db } from "../../../lib/db.js";

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
	if (
		!approval ||
		approval.org_id !== orgId ||
		approval.provider !== WEB_CHAT_PROVIDER
	) {
		return { error: "Approval not found" };
	}
	const decidability = approvalDecidability({ approval });
	if (!decidability.decidable) {
		return {
			error:
				decidability.reason === "expired"
					? "Approval expired"
					: `Approval ${decidability.reason}`,
		};
	}

	if (action === "reject") {
		const cancelled = await chatApprovalRepo.cancel({
			approvalId,
			db,
			providerUserId,
		});
		if (!cancelled) {
			const current = await chatApprovalRepo.get({ approvalId, db });
			return current?.status === "cancelled"
				? { status: "rejected" }
				: { error: "Approval already decided" };
		}
		return { status: "rejected" };
	}

	const result = await resolveApproval({ approval, providerUserId });
	if ("drifted" in result) {
		return { error: result.message };
	}
	if ("error" in result) {
		return { error: result.message };
	}
	return { status: "approved", text: result.text };
};
