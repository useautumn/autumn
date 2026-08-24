import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import type {
	AgentThreadRef,
	AgentTurnParams,
} from "../../../domain/agentTurnContext.js";
import { adoptPostedEveSession } from "../../../eve/adoptPostedSession.js";
import {
	type EveMessageContent,
	EveSessionGoneError,
	fastForwardEveStreamIndex,
	postEveMessage,
} from "../../../eve/client.js";
import { deleteEveSession } from "../../../eve/repo.js";
import {
	initialEveSessionState,
	saveEveSessionState,
} from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { isContinuationTokenAlive } from "../../../eve/world.js";
import { buildAgentThreadKey } from "../../../sessions/agentThreadKey.js";

const OUTSTANDING_PARK_NOTE =
	"(Pending write approvals in this thread were withdrawn because the user moved on with a new message. Do not rebuild, retry, or ask about them — act on the user's message.)";

/** Parks eve is still waiting on that nothing in this post answers. A message
 * posted over an open gated park is silently deferred by eve — the thread
 * would go dead — so every one of them is denied in the same post. */
const outstandingGatedDenies = ({
	answered,
	session,
}: {
	answered: ReadonlyArray<{ requestId: string }>;
	session: EveSessionRef;
}) => {
	const answeredIds = new Set(answered.map((response) => response.requestId));
	return session.state.pendingRequests
		.filter(
			(request) =>
				request.kind === "gated" && !answeredIds.has(request.requestId),
		)
		.map((request) => ({
			optionId: request.denyOptionId ?? "deny",
			requestId: request.requestId,
		}));
};

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
	const explicitResponses = [
		...(withdrawalResponses ?? []),
		...(chipResponses ?? []),
	];
	const outstanding = session
		? outstandingGatedDenies({ answered: explicitResponses, session })
		: [];
	const inputResponses =
		explicitResponses.length || outstanding.length
			? [...explicitResponses, ...outstanding]
			: undefined;
	if (
		session &&
		(await isContinuationTokenAlive(session.state.continuationToken)) === false
	) {
		// Posting would make eve silently start a new run under this token;
		// drop the row so the caller restarts the thread on a fresh session.
		await deleteEveSession({
			db,
			env,
			orgId,
			reason: "session_gone",
			sessionId: session.sessionId,
			threadKey: session.threadKey,
		});
		throw new EveSessionGoneError(
			`Eve no longer holds the delivery hook for session ${session.sessionId}`,
		);
	}
	if (session && !inputResponses) {
		await fastForwardEveStreamIndex({ auth, session });
	}
	const note =
		withdrawal?.note ??
		(outstanding.length ? OUTSTANDING_PARK_NOTE : undefined);
	const outboundMessage = chipResponses
		? undefined
		: note && inputResponses
			? withNotePrefix(message, note)
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
		if (inputResponses) session.state.pendingRequests = [];
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
