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
import { chatApprovalStepsRepo } from "../repos/chatApprovalStepsRepo.js";

/** The one way to deny an eve park without carding it: answers the primary
 * AND every sibling request (eve defers all deliveries until the whole batch
 * is answered), then drains the resumed turn and persists the cursor —
 * skipping the drain leaves the model's ack to replay as the reply to the
 * user's next message. */
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
	const stepRows = await chatApprovalStepsRepo.list({
		approvalId: approval.id,
		db,
	});
	const posted = await postEveInputResponse({
		auth,
		note,
		optionId: denyOptionOf(approval),
		requestId: approval.tool_call_id,
		session,
		siblingOptionIdFor: siblingDenyOptionFor(stepRows),
		siblingRequestIds: siblingRequestIdsOf({ approval, steps: stepRows }),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedAgentTurn({ auth, orgId: approval.org_id, session });
};
