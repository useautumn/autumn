import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import type {
	AgentThreadRef,
	AgentTurnParams,
} from "../../../domain/agentTurnContext.js";
import { adoptPostedEveSession } from "../../../eve/adoptPostedSession.js";
import {
	type EveMessageContent,
	fastForwardEveStreamIndex,
	postEveMessage,
} from "../../../eve/client.js";
import { deleteEveSession } from "../../../eve/repo.js";
import {
	initialEveSessionState,
	saveEveSessionState,
} from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { buildAgentThreadKey } from "../../../sessions/agentThreadKey.js";

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
	params: AgentTurnParams;
	session?: EveSessionRef;
	thread: AgentThreadRef;
}): Promise<EveSessionRef> => {
	// Sending chip answers as messages would replay them as a second user turn.
	const inputResponses =
		session && params.questionResponse ? [params.questionResponse] : undefined;
	if (session && !inputResponses) {
		await fastForwardEveStreamIndex({ auth, session });
	}
	const posted = await postEveMessage({
		auth,
		clientContext: params.clientContext,
		inputResponses,
		message: inputResponses ? undefined : message,
		session,
	}).catch(async (error) => {
		if (session) {
			await deleteEveSession({
				db,
				env,
				orgId,
				reason: "post_failed",
				sessionId: session.sessionId,
				threadKey: session.threadKey,
			});
		}
		throw error;
	});
	if (session) {
		adoptPostedEveSession({ posted, session, status: "running" });
	}
	const started: EveSessionRef = session ?? {
		env,
		newSession: true,
		sessionId: posted.sessionId,
		state: initialEveSessionState(posted.continuationToken),
		threadKey: buildAgentThreadKey({ env, thread }),
	};
	await saveEveSessionState({ orgId, session: started });
	return started;
};
