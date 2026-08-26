import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { abandonEveSession } from "../../agentRuntime/eve/abandonSession.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import {
	approvalAuthContext,
	approvalThreadRef,
} from "../domain/approvalRecord.js";
import { denyApprovalParkAndDrain } from "./denyApprovalParkAndDrain.js";

/** Best effort: denies and drains the eve park behind a cancelled card so the
 * session stops waiting on it; a session that keeps re-parking is abandoned. */
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
		const { stuck } = await denyApprovalParkAndDrain({
			approval,
			auth: approvalAuthContext({ approval, providerUserId }),
			note,
			session,
		});
		if (!stuck) return;
		await abandonEveSession({
			env: approval.env,
			orgId: approval.org_id,
			providerUserId,
			reason: "drain_stuck",
			session,
			thread: approvalThreadRef(approval),
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
