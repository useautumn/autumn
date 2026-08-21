import { getEveSessionBySessionId } from "../../../internal/agentRuntime/eve/repo.js";
import { denyApprovalParkAndDrain } from "../../../internal/approvals/actions/denyApprovalParkAndDrain.js";
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

/** Cancels a pending approval whose write the user applied from the
 * dashboard: card settles as superseded, the eve park is denied and the
 * resumed turn drained — leaving the stream index stale would replay the
 * model's ack as the reply to the user's NEXT message. */
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

	// Best-effort: releasing the eve park keeps the session from waiting on a
	// dead card; a gone session changes nothing for the applied write.
	try {
		const session = cancelled.run_id
			? await getEveSessionBySessionId({
					db,
					orgId: cancelled.org_id,
					sessionId: cancelled.run_id,
				})
			: undefined;
		if (session) {
			await denyApprovalParkAndDrain({
				approval: cancelled,
				auth: {
					appEnv: cancelled.env,
					channelId: cancelled.channel_id,
					orgId: cancelled.org_id,
					provider: cancelled.provider,
					providerUserId: userId,
					threadId: cancelled.channel_id,
					workspaceId: cancelled.workspace_id,
				},
				note: SUPERSEDED_NOTE,
				session,
			});
		}
	} catch (error) {
		logger.warn("Could not deny superseded approval in eve", {
			event: "leaf.approval_dashboard_supersede_deny_failed",
			approval_id: approvalId,
			data: { error },
		});
	}

	void settleCardRemotely({
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
