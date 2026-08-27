import { logger } from "../../../../lib/logger.js";
import { answerEveInput } from "../../eve/answerEveInput.js";
import { isEveTransportLost, resyncEveStreamIndex } from "../../eve/client.js";
import { approvalOptionIds, isTerminalEveEventType } from "../../eve/events.js";
import {
	classifyParkedEveInput,
	type ParkedEveInput,
	pendingGatedRequests,
} from "../../eve/parkedInput.js";
import {
	advanceStreamCursor,
	saveEveSessionState,
	statusAfterTerminalEvent,
} from "../../eve/sessionState.js";
import { streamEveEventsWithReconnect } from "../../eve/streamWithReconnect.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { DRAIN_IDLE_TIMEOUT_MS } from "../../turnBudget.js";
import { QUEUED_TURN_WITHDRAWAL_NOTE } from "./agentInputNotes.js";

const MAX_DRAIN_DENIES = 3;

type GatedPark = Extract<ParkedEveInput, { kind: "gated" }>;

const denyGatedPark = async ({
	auth,
	parked,
	session,
}: {
	auth: EveAuthContext;
	parked: GatedPark;
	session: EveSessionRef;
}) => {
	const siblingDenyOptions = new Map(
		parked.withheld.map((write) => [write.requestId, write.denyOptionId]),
	);
	await answerEveInput({
		auth,
		note: QUEUED_TURN_WITHDRAWAL_NOTE,
		optionId: approvalOptionIds({ options: parked.chained.options }).deny,
		requestId: parked.chained.requestId,
		session,
		siblingOptionIdFor: (siblingRequestId) =>
			siblingDenyOptions.get(siblingRequestId) ?? undefined,
		siblingRequestIds: parked.siblingRequestIds,
	});
};

/** One pass over the stream; `parkedAgain` asks for another after a deny. */
const drainPass = async ({
	auth,
	denies,
	session,
}: {
	auth: EveAuthContext;
	denies: number;
	session: EveSessionRef;
}): Promise<{ parkedAgain: boolean; stuck: boolean }> => {
	let turnStarted = false;
	for await (const event of streamEveEventsWithReconnect({
		auth,
		idleTimeoutMs: DRAIN_IDLE_TIMEOUT_MS,
		session,
	})) {
		advanceStreamCursor(session);
		if (event.type === "turn.started") {
			turnStarted = true;
			continue;
		}
		if (event.type === "input.requested") {
			const parked = classifyParkedEveInput({ requests: event.requests });
			if (parked?.kind === "gated" && denies < MAX_DRAIN_DENIES) {
				await denyGatedPark({ auth, parked, session });
				logger.info("Denied a re-parked write while draining", {
					event: "leaf.eve_drain_denied",
					data: {
						deny_count: denies + 1,
						request_id: parked.chained.requestId,
						session_id: session.sessionId,
						sibling_count: parked.siblingRequestIds.length,
					},
				});
				return { parkedAgain: true, stuck: false };
			}
			const stuck = parked?.kind === "gated";
			if (parked?.kind === "gated") {
				session.state.pendingRequests = pendingGatedRequests(parked);
				logger.warn("Drain gave up on a turn that re-parks after every deny", {
					event: "leaf.eve_drain_stuck",
					data: {
						denies,
						request_ids: session.state.pendingRequests.map(
							(request) => request.requestId,
						),
						session_id: session.sessionId,
					},
				});
			}
			session.state.status = "waiting";
			return { parkedAgain: false, stuck };
		}
		if (turnStarted && isTerminalEveEventType(event.type)) {
			session.state.status = statusAfterTerminalEvent(event.type);
			return { parkedAgain: false, stuck: false };
		}
	}
	return { parkedAgain: false, stuck: false };
};

export const drainParkedAgentTurn = async ({
	auth,
	orgId,
	session,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
}): Promise<{ stuck: boolean }> => {
	let denies = 0;
	let stuck = false;
	let parkedAgain = true;
	while (parkedAgain) {
		try {
			({ parkedAgain, stuck } = await drainPass({ auth, denies, session }));
			if (parkedAgain) denies += 1;
		} catch (error) {
			if (!isEveTransportLost(error)) throw error;
			logger.warn("Drain stream lost; resyncing the cursor", {
				event: "leaf.eve_drain_stream_lost",
				data: {
					session_id: session.sessionId,
					stream_index: session.state.streamIndex,
				},
				error,
			});
			await resyncEveStreamIndex({ auth, session });
			session.state.status = "waiting";
			parkedAgain = false;
		}
	}
	await saveEveSessionState({ orgId, session });
	return { stuck };
};
