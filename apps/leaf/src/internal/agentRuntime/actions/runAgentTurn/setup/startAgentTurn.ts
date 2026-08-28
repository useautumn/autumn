import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import { chatApprovalRepo } from "../../../../approvals/repos/chatApprovalRepo.js";
import type {
	AgentThreadRef,
	AgentTurnParams,
} from "../../../domain/agentTurnContext.js";
import {
	type EveMessageContent,
	postEveInputResponse,
	postEveMessage,
} from "../../../eve/client.js";
import { deleteEveSession } from "../../../eve/repo.js";
import {
	initialEveSessionState,
	removePendingRequests,
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
	const questionResponse = session && params.questionResponse;
	if (session && !questionResponse) {
		await chatApprovalRepo.detachPendingForRun({
			db,
			runId: session.sessionId,
		});
	}
	const posted = await (questionResponse
		? postEveInputResponse({ auth, session, ...questionResponse })
		: postEveMessage({
				auth,
				clientContext: params.clientContext,
				message,
				session,
			})
	).catch(async (error) => {
		if (!session) throw error;
		logger.warn("Eve message post failed; dropping the session", {
			event: "leaf.eve_post_failed",
			data: {
				had_input_responses: Boolean(questionResponse),
				session_id: session.sessionId,
			},
			error,
		});
		await deleteEveSession({
			db,
			env,
			orgId,
			reason: "post_failed",
			sessionId: session.sessionId,
			threadKey: session.threadKey,
		});
		throw error;
	});
	if (session && questionResponse) {
		removePendingRequests({
			requestIds: new Set([questionResponse.requestId]),
			session,
		});
	}
	const started: EveSessionRef = session ?? {
		env,
		newSession: true,
		sessionId: posted.sessionId,
		state: initialEveSessionState(),
		threadKey: buildAgentThreadKey({ env, thread }),
	};
	await saveEveSessionState({ orgId, session: started });
	return started;
};
