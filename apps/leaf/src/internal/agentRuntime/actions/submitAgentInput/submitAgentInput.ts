import { answerEveInput } from "../../eve/answerEveInput.js";
import { saveEveSessionState } from "../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { consumeResumedAgentTurn } from "./consumeResumedAgentTurn.js";

export const submitAgentInput = async ({
	approveSiblings,
	auth,
	childSessionIds,
	expectedToolNames,
	note,
	optionId,
	orgId,
	requestId,
	session,
	siblingOptionIdFor,
	siblingRequestIds,
}: {
	approveSiblings?: boolean;
	auth: EveAuthContext;
	childSessionIds?: ReadonlyArray<string>;
	expectedToolNames?: ReadonlyArray<string>;
	note?: string;
	optionId: string;
	orgId: string;
	requestId: string;
	session: EveSessionRef;
	siblingOptionIdFor?: (siblingRequestId: string) => string | undefined;
	siblingRequestIds?: ReadonlyArray<string>;
}) => {
	await answerEveInput({
		approveSiblings,
		auth,
		note,
		optionId,
		requestId,
		session,
		siblingOptionIdFor,
		siblingRequestIds,
	});
	await saveEveSessionState({ orgId, session });
	return consumeResumedAgentTurn({
		auth,
		childSessionIds,
		expectedToolNames,
		orgId,
		session,
		skipRequestId: requestId,
	});
};
