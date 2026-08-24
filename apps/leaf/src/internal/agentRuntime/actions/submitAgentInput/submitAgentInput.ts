import { db } from "../../../../lib/db.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../eve/client.js";
import { upsertEveSession } from "../../eve/repo.js";
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
	suppressSiblingWithheldNote,
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
	suppressSiblingWithheldNote?: boolean;
}) => {
	const posted = await postEveInputResponse({
		approveSiblings,
		auth,
		note,
		optionId,
		requestId,
		session,
		siblingOptionIdFor,
		siblingRequestIds,
		suppressSiblingWithheldNote,
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	session.state.pendingRequests = [];
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	return consumeResumedAgentTurn({
		auth,
		childSessionIds,
		expectedToolNames,
		orgId,
		session,
		skipRequestId: requestId,
	});
};
