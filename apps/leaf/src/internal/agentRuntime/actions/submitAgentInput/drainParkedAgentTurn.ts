import { ms } from "@autumn/shared";
import { db } from "../../../../lib/db.js";
import { adoptPostedEveSession } from "../../eve/adoptPostedSession.js";
import {
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	resyncEveStreamIndex,
	streamEveEvents,
} from "../../eve/client.js";
import { approvalOptionIds } from "../../eve/events.js";
import { classifyParkedEveInput } from "../../eve/parkedInput.js";
import { upsertEveSession } from "../../eve/repo.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
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
}) => {
	let denies = 0;
	while (true) {
		let parkedAgain = false;
		let turnStarted = false;
		try {
			for await (const event of streamEveEvents({
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
						const posted = await postEveInputResponse({
							auth,
							note: QUEUED_TURN_WITHDRAWAL_NOTE,
							optionId: options.deny,
							requestId: parked.chained.requestId,
							session,
							siblingRequestIds: parked.siblingRequestIds,
						});
						adoptPostedEveSession({ posted, session });
						parkedAgain = true;
						break;
					}
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
			if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
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
};
