import { releaseSupersededPark } from "../../../internal/approvals/actions/releaseSupersededPark.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import { settleCardRemotely } from "../../../internal/approvals/surfaces/slack/settleCardRemotely.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";

const SUPERSEDED_NOTE =
	"The user applied this write from the dashboard instead, so this pending request is superseded. Do NOT re-issue it and do not reply — the change is already made. Handle any future user messages normally.";

export type SupersedeWebApprovalResult =
	| { superseded: true }
	| {
			superseded: false;
			code: "already_decided" | "not_found" | "org_mismatch";
	  };

export const supersedeWebApproval = async ({
	approvalId,
	orgId,
	userId,
}: {
	approvalId: string;
	orgId: string;
	userId: string;
}): Promise<SupersedeWebApprovalResult> => {
	const approval = await chatApprovalRepo.get({ approvalId, db });
	if (!approval) return { superseded: false, code: "not_found" };
	if (approval.org_id !== orgId) {
		return { superseded: false, code: "org_mismatch" };
	}
	const cancelled = await chatApprovalRepo.cancel({
		approvalId,
		db,
		providerUserId: userId,
	});
	if (!cancelled) return { superseded: false, code: "already_decided" };

	await releaseSupersededPark({
		approval: cancelled,
		note: SUPERSEDED_NOTE,
		providerUserId: userId,
	});
	await settleCardRemotely({
		approval: cancelled,
		status: "superseded",
		statusLine: "Applied from the dashboard",
	});
	logger.info("Superseded approval from dashboard", {
		event: "leaf.approval_superseded_from_dashboard",
		approval_id: approvalId,
		data: { org_id: orgId },
	});
	return { superseded: true };
};
