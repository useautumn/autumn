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

/** Cancels the whole parked batch, then consumes its resumed continuation. */
export const cancelApprovalParkAndDrain = async ({
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
	await drainParkedAgentTurn({ auth, orgId: approval.org_id, session });
};
