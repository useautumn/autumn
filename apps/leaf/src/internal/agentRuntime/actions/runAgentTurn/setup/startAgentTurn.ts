import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import { chatApprovalRepo } from "../../../../approvals/repos/chatApprovalRepo.js";
import type {
	AgentThreadRef,
	AgentTurnParams,
} from "../../../domain/agentTurnContext.js";
import { adoptPostedEveSession } from "../../../eve/adoptPostedSession.js";
import { type EveMessageContent, postEveMessage } from "../../../eve/client.js";
import { deleteEveSession } from "../../../eve/repo.js";
import {
	initialEveSessionState,
	saveEveSessionState,
} from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { buildAgentThreadKey } from "../../../sessions/agentThreadKey.js";
import { buildEveInputResponses } from "./buildEveInputResponses.js";

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
	const outbound = buildEveInputResponses({
		message,
		params,
		session,
	});
	if (session && outbound.inputResponses) {
		logger.info("Answering open eve parks alongside the message", {
			event: "leaf.eve_parks_answered_with_message",
			data: {
				chip_answered: Boolean(params.questionResponse),
				outstanding_request_ids: outbound.outstandingDenies.map(
					(response) => response.requestId,
				),
				session_id: session.sessionId,
			},
		});
	}
	const posted = await postEveMessage({
		auth,
		clientContext: params.clientContext,
		inputResponses: outbound.inputResponses,
		message: outbound.message,
		session,
	}).catch(async (error) => {
		if (!session) throw error;
		logger.warn("Eve message post failed; dropping the session", {
			event: "leaf.eve_post_failed",
			data: {
				had_input_responses: Boolean(outbound.inputResponses),
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
	if (session) {
		const staleSessionId = session.sessionId;
		const { rehomed } = adoptPostedEveSession({ posted, session });
		if (outbound.inputResponses) session.state.pendingRequests = [];
		if (rehomed) {
			await chatApprovalRepo.moveToRun({
				db,
				fromRunId: staleSessionId,
				toRunId: session.sessionId,
			});
			logger.warn("Eve re-homed the session onto a new run", {
				event: "leaf.eve_session_rehomed",
				data: {
					session_id: session.sessionId,
					stale_session_id: staleSessionId,
				},
			});
		}
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
