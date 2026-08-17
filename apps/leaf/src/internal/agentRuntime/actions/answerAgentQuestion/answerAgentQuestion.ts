import { db } from "../../../../lib/db.js";
import { createChainedApproval } from "../../../approvals/actions/createChainedApproval.js";
import type { PendingQuestion } from "../../eve/parkedInput.js";
import { getEveSessionBySessionId } from "../../eve/repo.js";
import type { EveAuthContext } from "../../eve/types.js";
import { submitAgentInput } from "../submitAgentInput/submitAgentInput.js";

export const answerAgentQuestion = async ({
	auth,
	optionId,
	orgId,
	requestId,
	sessionId,
}: {
	auth: EveAuthContext;
	optionId: string;
	orgId: string;
	requestId: string;
	sessionId: string;
}): Promise<
	| { error: true; message: string }
	| {
			chainedApprovalId?: string;
			question?: PendingQuestion;
			sessionId: string;
			text: string;
	  }
> => {
	const session = await getEveSessionBySessionId({ db, orgId, sessionId });
	if (!session) return { error: true, message: "Eve session not found." };
	const { chained, chainedSiblingRequestIds, question, text } =
		await submitAgentInput({
			auth,
			optionId,
			orgId,
			requestId,
			session,
		});
	const chainedApprovalId = chained
		? await createChainedApproval({
				auth,
				chained,
				providerUserId: auth.providerUserId,
				sessionId: session.sessionId,
				siblingRequestIds: chainedSiblingRequestIds,
			})
		: undefined;
	return { chainedApprovalId, question, sessionId: session.sessionId, text };
};
