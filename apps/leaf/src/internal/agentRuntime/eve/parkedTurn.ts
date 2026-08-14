import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { adoptPostedEveSession } from "./adoptPostedSession.js";
import {
	classifyParkedEveInput,
	siblingRequestIdsFromToolArgs,
} from "./classifyParkedInput.js";
import {
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import { approvalOptionIds, type EveInputRequest } from "./events.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

const DRAIN_DENY_NOTE =
	"(The user sent a newer message before this was shown, so it was withdrawn. Do not rebuild or ask anything — reply with nothing; act on the user's next message instead.)";
const MAX_DRAIN_DENIES = 3;
const DRAIN_IDLE_TIMEOUT_MS = 60_000;

export const denyOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveDenyOptionId === "string"
		? args._eveDenyOptionId
		: "deny";
};

export const drainParkedEveTurn = async ({
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
						requests: (event.data?.requests ?? []) as EveInputRequest[],
					});
					if (parked?.kind === "gated" && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const options = approvalOptionIds({
							options: parked.chained.options,
						});
						const posted = await postEveInputResponse({
							auth,
							note: DRAIN_DENY_NOTE,
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

export const withdrawEveSuspension = async ({
	auth,
	orgId,
	runId,
	suspension,
}: {
	auth: EveAuthContext;
	orgId: string;
	runId: string;
	suspension: { toolArgs: Record<string, unknown>; toolCallId?: string };
}) => {
	if (!suspension.toolCallId) return false;
	const session = await getEveSessionBySessionId({
		db,
		orgId,
		sessionId: runId,
	});
	if (!session) return false;
	const denyOptionId =
		typeof suspension.toolArgs._eveDenyOptionId === "string"
			? suspension.toolArgs._eveDenyOptionId
			: "deny";
	const posted = await postEveInputResponse({
		auth,
		note: DRAIN_DENY_NOTE,
		optionId: denyOptionId,
		requestId: suspension.toolCallId,
		session,
		siblingRequestIds: siblingRequestIdsFromToolArgs(suspension.toolArgs),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedEveTurn({ auth, orgId, session });
	return true;
};
