import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import { approvalAuthContext } from "../domain/approvalRecord.js";
import { cancelApprovalParkAndDrain } from "./cancelApprovalParkAndDrain.js";

/** Best effort: cancels the Eve request behind a superseded card. */
export const releaseSupersededPark = async ({
	approval,
	note,
	providerUserId,
}: {
	approval: ChatApproval;
	note: string;
	providerUserId: string;
}) => {
	try {
		const session = approval.run_id
			? await getEveSessionBySessionId({
					db,
					orgId: approval.org_id,
					sessionId: approval.run_id,
				})
			: undefined;
		if (!session) return;
		await cancelApprovalParkAndDrain({
			approval,
			auth: approvalAuthContext({ approval, providerUserId }),
			note,
			session,
		});
	} catch (error) {
		logger.warn("Could not release the eve park behind a superseded approval", {
			event: "leaf.approval_supersede_release_failed",
			approval_id: approval.id,
			data: { session_id: approval.run_id },
			error,
		});
	}
};
