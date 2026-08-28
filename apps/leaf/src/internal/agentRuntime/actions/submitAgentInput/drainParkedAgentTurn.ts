import { logger } from "../../../../lib/logger.js";
import { isEveTransportLost, streamEveEvents } from "../../eve/client.js";
import { isTerminalEveEventType } from "../../eve/events.js";
import {
	classifyParkedEveInput,
	pendingGatedRequests,
} from "../../eve/parkedInput.js";
import {
	addPendingRequests,
	advanceStreamCursor,
	saveEveSessionState,
} from "../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { DRAIN_IDLE_TIMEOUT_MS } from "../../turnBudget.js";

/** Consumes one answered-input continuation without deciding any later parks. */
export const drainParkedAgentTurn = async ({
	auth,
	orgId,
	session,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
}) => {
	try {
		for await (const event of streamEveEvents({
			auth,
			idleTimeoutMs: DRAIN_IDLE_TIMEOUT_MS,
			session,
		})) {
			advanceStreamCursor(session);
			if (event.type === "input.requested") {
				const parked = classifyParkedEveInput({ requests: event.requests });
				const requests =
					parked?.kind === "gated"
						? pendingGatedRequests(parked)
						: event.requests.map((request) => ({
								kind: "question" as const,
								requestId: request.requestId,
							}));
				addPendingRequests({ requests, session });
			}
			if (isTerminalEveEventType(event.type)) break;
		}
	} catch (error) {
		if (!isEveTransportLost(error)) throw error;
		logger.warn("Answered Eve input stream was lost", {
			event: "leaf.eve_answer_stream_lost",
			data: {
				session_id: session.sessionId,
				stream_index: session.state.streamIndex,
			},
			error,
		});
	}
	await saveEveSessionState({ orgId, session });
};
