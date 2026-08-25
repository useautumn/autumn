import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { drainParkedAgentTurn } from "../../agentRuntime/actions/submitAgentInput/drainParkedAgentTurn.js";
import { answerEveInput } from "../../agentRuntime/eve/answerEveInput.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../agentRuntime/eve/types.js";
import { approvalDenyPlan } from "../domain/approvalRecord.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";

/** Denies the whole parked batch, then drains the resumed turn — an undrained
 * ack would replay as the reply to the user's next message. */
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
	const toolCallId = approval.tool_call_id;
	if (!toolCallId) return { stuck: false };
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	await answerEveInput({
		auth,
		note,
		session,
		...approvalDenyPlan({
			approval: { ...approval, tool_call_id: toolCallId },
			writes,
		}),
	});
	return drainParkedAgentTurn({ auth, orgId: approval.org_id, session });
};
