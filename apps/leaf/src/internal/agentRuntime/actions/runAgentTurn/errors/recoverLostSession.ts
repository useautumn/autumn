import type { AgentTurnContext } from "../../../domain/agentTurnContext.js";
import { abandonEveSession } from "../../../eve/abandonSession.js";
import {
	EveSessionDeadError,
	EveSessionGoneError,
} from "../../../eve/client.js";
import type { EveSessionRef } from "../../../eve/types.js";

export const recoverLostSession = async ({
	ctx,
	error,
	existingSession,
	session,
}: {
	ctx: AgentTurnContext;
	error: unknown;
	existingSession?: EveSessionRef;
	session: EveSessionRef;
}) => {
	if (!existingSession) throw error;
	const { env, logger, org, providerUserId, thread } = ctx;
	if (error instanceof EveSessionGoneError) {
		logger.warn("Eve session gone at message post; starting fresh", {
			event: "leaf.eve_session_gone_restarted",
			data: { session_id: session.sessionId },
			error,
		});
		return;
	}
	if (error instanceof EveSessionDeadError) {
		logger.warn("Eve session is dead; restarting the thread fresh", {
			event: "leaf.eve_session_dead_restarted",
			data: { session_id: session.sessionId },
			error,
		});
		await abandonEveSession({
			env,
			orgId: org.id,
			providerUserId,
			reason: "session_dead",
			session,
			thread,
		});
		return;
	}
	throw error;
};
