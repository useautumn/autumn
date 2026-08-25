import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import type { ApprovalWithdrawal } from "../../../../approvals/actions/withdrawSupersededApprovals.js";
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
import { assertEveSessionAlive } from "./assertEveSessionAlive.js";
import { buildEveInputResponses } from "./buildEveInputResponses.js";

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
	withdrawal?: ApprovalWithdrawal;
}): Promise<EveSessionRef> => {
	const outbound = buildEveInputResponses({
		message,
		params,
		session,
		withdrawal,
	});
	if (session) {
		await assertEveSessionAlive({ env, orgId, session });
		if (outbound.inputResponses) {
			logger.info("Answering open eve parks alongside the message", {
				event: "leaf.eve_parks_answered_with_message",
				data: {
					chip_answered: Boolean(params.questionResponse),
					outstanding_request_ids: outbound.outstandingDenies.map(
						(response) => response.requestId,
					),
					session_id: session.sessionId,
					withdrawn_request_ids: (withdrawal?.inputResponses ?? []).map(
						(response) => response.requestId,
					),
				},
			});
		} else {
			await fastForwardEveStreamIndex({ auth, session });
		}
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
		adoptPostedEveSession({ posted, session, status: "running" });
		if (outbound.inputResponses) session.state.pendingRequests = [];
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
