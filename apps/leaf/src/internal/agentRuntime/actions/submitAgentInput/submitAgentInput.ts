import { db } from "../../../../lib/db.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../eve/client.js";
import { upsertEveSession } from "../../eve/repo.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { consumeResumedAgentTurn } from "./consumeResumedAgentTurn.js";

export const submitAgentInput = async ({
	approveSiblings,
	auth,
	expectedToolNames,
	note,
	optionId,
	orgId,
	requestId,
	session,
	siblingRequestIds,
}: {
	approveSiblings?: boolean;
	auth: EveAuthContext;
	expectedToolNames?: ReadonlyArray<string>;
	note?: string;
	optionId: string;
	orgId: string;
	requestId: string;
	session: EveSessionRef;
	siblingRequestIds?: ReadonlyArray<string>;
}) => {
	const posted = await postEveInputResponse({
		approveSiblings,
		auth,
		note,
		optionId,
		requestId,
		session,
		siblingRequestIds,
	});
	adoptPostedEveSession({ posted, session, status: "running" });
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
		expectedToolNames,
		orgId,
		session,
		skipRequestId: requestId,
	});
};
