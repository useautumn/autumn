import type { AppEnv } from "@autumn/shared";
import type {
	MessageParams,
	ThreadRef,
} from "../../../../../agent/runMessage/types.js";
import { buildThreadKey } from "../../../../../harness/common/threadKey.js";
import { adoptPostedEveSession } from "../../../eve/adoptPostedSession.js";
import { type EveMessageContent, postEveMessage } from "../../../eve/client.js";
import {
	initialEveSessionState,
	saveEveSessionState,
} from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";

export const startAgentTurn = async ({
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
	// Sending chip answers as messages would replay them as a second user turn.
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
