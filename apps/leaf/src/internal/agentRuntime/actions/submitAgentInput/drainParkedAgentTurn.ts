import { ms } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import {
	EveStreamDisconnectedError,
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	resyncEveStreamIndex,
} from "../../eve/client.js";
import { approvalOptionIds } from "../../eve/events.js";
import { classifyParkedEveInput } from "../../eve/parkedInput.js";
import { upsertEveSession } from "../../eve/repo.js";
import { streamEveEventsWithReconnect } from "../../eve/streamWithReconnect.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import { pendingGatedRequests } from "../runAgentTurn/execute/eveTurnReducer.js";
import { QUEUED_TURN_WITHDRAWAL_NOTE } from "./agentInputNotes.js";

const MAX_DRAIN_DENIES = 3;
const DRAIN_IDLE_TIMEOUT_MS = ms.minutes(1);

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
	while (true) {
		let parkedAgain = false;
		let turnStarted = false;
		try {
			for await (const event of streamEveEventsWithReconnect({
				auth,
				idleTimeoutMs: DRAIN_IDLE_TIMEOUT_MS,
				session,
			})) {
				session.state.streamIndex += 1;
				session.state.lastEventAt = Date.now();
				if (event.type === "turn.started") {
					turnStarted = true;
				} else if (event.type === "input.requested") {
					const parked = classifyParkedEveInput({
						requests: event.requests,
					});
					if (parked?.kind === "gated" && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const options = approvalOptionIds({
							options: parked.chained.options,
						});
						const siblingDenyOptions = new Map(
							parked.withheld.map((write) => [
								write.requestId,
								write.denyOptionId,
							]),
						);
						const posted = await postEveInputResponse({
							auth,
							note: QUEUED_TURN_WITHDRAWAL_NOTE,
							optionId: options.deny,
							requestId: parked.chained.requestId,
							session,
							siblingOptionIdFor: (siblingRequestId) =>
								siblingDenyOptions.get(siblingRequestId) ?? undefined,
							siblingRequestIds: parked.siblingRequestIds,
						});
						adoptPostedEveSession({ posted, session });
						session.state.pendingRequests = [];
						parkedAgain = true;
						break;
					}
					if (parked?.kind === "gated") {
						session.state.pendingRequests = pendingGatedRequests(parked);
					}
					// A gated park past the deny cap is a turn that rebuilds after
					// every denial; leaving it parked would hang the session.
					stuck = parked?.kind === "gated";
					session.state.status = "waiting";
					break;
				} else if (
					turnStarted &&
					(event.type === "session.waiting" ||
						event.type === "session.completed" ||
						event.type === "turn.failed" ||
						event.type === "session.failed")
				) {
					session.state.status =
						event.type === "session.completed" ? "completed" : "waiting";
					break;
				}
			}
		} catch (error) {
			const transportLost =
				error instanceof EveStreamDisconnectedError ||
				error instanceof EveStreamIdleTimeoutError;
			if (!transportLost) throw error;
			await resyncEveStreamIndex({ auth, session });
			session.state.status = "waiting";
		}
		if (!parkedAgain) break;
	}
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	return { stuck };
};
