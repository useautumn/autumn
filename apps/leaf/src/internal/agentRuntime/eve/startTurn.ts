import type { AppEnv } from "@autumn/shared";
import type { MessageParams, ThreadRef } from "../../../agent/runMessage/types.js";
import { buildThreadKey } from "../../../harness/common/threadKey.js";
import { adoptPostedEveSession } from "./adoptPostedSession.js";
import { type EveMessageContent, postEveMessage } from "./client.js";
import { initialEveSessionState, saveEveSessionState } from "./sessionState.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

/** Posts this turn onto the thread's session (opening one when there is none)
 * and persists the cursor the stream then resumes from. */
export const startEveTurn = async ({
	auth,
	env,
	message,
	orgId,
	params,
	session,
	thread,
}: {
	auth: EveAuthContext;
	env: AppEnv;
	message: EveMessageContent;
	orgId: string;
	params: MessageParams;
	session?: EveSessionRef;
	thread: ThreadRef;
}): Promise<EveSessionRef> => {
	// A chip answer resolves the parked request structurally; sending the
	// wrapped message too would replay it as a second user turn.
	const inputResponses =
		session && params.questionResponse ? [params.questionResponse] : undefined;
	const posted = await postEveMessage({
		auth,
		clientContext: params.clientContext,
		inputResponses,
		message: inputResponses ? undefined : message,
		session,
	});
	if (session) {
		adoptPostedEveSession({ posted, session, status: "running" });
	}
	const started: EveSessionRef = session ?? {
		env,
		newSession: true,
		sessionId: posted.sessionId,
		state: initialEveSessionState(posted.continuationToken),
		threadKey: buildThreadKey({ env, thread }),
	};
	await saveEveSessionState({ orgId, session: started });
	return started;
};
