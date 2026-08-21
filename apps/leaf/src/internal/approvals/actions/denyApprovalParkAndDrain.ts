import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { drainParkedAgentTurn } from "../../agentRuntime/actions/submitAgentInput/drainParkedAgentTurn.js";
import { adoptPostedEveSession } from "../../agentRuntime/eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../agentRuntime/eve/client.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../agentRuntime/eve/types.js";
import {
	denyOptionOf,
	siblingDenyOptionFor,
	siblingRequestIdsOf,
} from "../domain/approvalRecord.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";

/** Denies the whole parked batch (primary + siblings), then drains the resumed
 * turn — an undrained ack would replay as the reply to the user's next message. */
export const denyApprovalParkAndDrain = async ({
	approval,
	auth,
	note,
	session,
}: {
	approval: ChatApproval;
	auth: EveAuthContext;
	note: string;
	session: EveSessionRef;
}) => {
	if (!approval.tool_call_id) return;
	const writeRows = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const posted = await postEveInputResponse({
		auth,
		note,
		optionId: denyOptionOf(approval),
		requestId: approval.tool_call_id,
		session,
		siblingOptionIdFor: siblingDenyOptionFor(writeRows),
		siblingRequestIds: siblingRequestIdsOf({ approval, writes: writeRows }),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedAgentTurn({ auth, orgId: approval.org_id, session });
};
