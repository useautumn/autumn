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

const withNotePrefix = (
	message: EveMessageContent,
	note: string,
): EveMessageContent =>
	typeof message === "string"
		? `${note}\n\n${message}`
		: [{ text: note, type: "text" as const }, ...message];

export const startAgentTurn = async ({
	auth,
	env,
	message,
	orgId,
	params,
	session,
	thread,
	withdrawal,
}: {
	auth: EveAuthContext;
	env: AppEnv;
	message: EveMessageContent;
	orgId: string;
	params: AgentTurnParams;
	session?: EveSessionRef;
	thread: AgentThreadRef;
	withdrawal?: {
		inputResponses: Array<{ optionId: string; requestId: string }>;
		note: string;
	};
}): Promise<EveSessionRef> => {
	// Sending chip answers as messages would replay them as a second user turn.
	const chipResponses =
		session && params.questionResponse ? [params.questionResponse] : undefined;
	// Withdrawal denies ride the same post as the message, so superseding a
	// pending card never spends a separate eve turn winding the old work down.
	const withdrawalResponses = session ? withdrawal?.inputResponses : undefined;
	const inputResponses =
		chipResponses || withdrawalResponses
			? [...(withdrawalResponses ?? []), ...(chipResponses ?? [])]
			: undefined;
	if (session && !inputResponses) {
		await fastForwardEveStreamIndex({ auth, session });
	}
	const outboundMessage = chipResponses
		? undefined
		: withdrawalResponses && withdrawal
			? withNotePrefix(message, withdrawal.note)
			: message;
	const posted = await postEveMessage({
		auth,
		clientContext: params.clientContext,
		inputResponses,
		message: outboundMessage,
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
