import { db } from "../../../../lib/db.js";
import { streamEveEvents } from "../../eve/client.js";
import { classifyParkedEveInput } from "../../eve/parkedInput.js";
import { upsertEveSession } from "../../eve/repo.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import type { ResumedAgentTurn } from "./types.js";

export const consumeResumedAgentTurn = async ({
	auth,
	orgId,
	session,
	skipRequestId,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
	skipRequestId?: string;
}): Promise<ResumedAgentTurn> => {
	let text = "";
	let pendingText = "";
	let chained: ResumedAgentTurn["chained"];
	let chainedSiblingRequestIds: ReadonlyArray<string> = [];
	let question: ResumedAgentTurn["question"];
	let sawEvent = false;
	let sawTurnActivity = false;
	let turnStarted = false;
	for await (const event of streamEveEvents({ auth, session })) {
		sawEvent = true;
		session.state.streamIndex += 1;
		session.state.lastEventAt = Date.now();
		if (
			event.type === "step.started" ||
			event.type === "actions.requested" ||
			event.type === "action.result" ||
			event.type === "input.requested"
		) {
			sawTurnActivity = true;
		}
		if (event.type === "turn.started") {
			turnStarted = true;
		} else if (event.type === "input.requested") {
			const parkedInput = classifyParkedEveInput({
				requests: event.requests,
				skipRequestId,
			});
			if (parkedInput?.kind === "gated") {
				chained = parkedInput.chained;
				chainedSiblingRequestIds = parkedInput.siblingRequestIds;
				break;
			}
			if (parkedInput?.kind === "question") {
				question = parkedInput.question;
				session.state.status = "waiting";
				break;
			}
			if (parkedInput) {
				if (!(text || pendingText)) text = parkedInput.text;
				session.state.status = "waiting";
				break;
			}
		} else if (event.type === "message.appended" && turnStarted) {
			sawTurnActivity = true;
			const messageSoFar = event.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${event.messageDelta}`;
		} else if (event.type === "message.completed" && turnStarted) {
			sawTurnActivity = true;
			if (event.finishReason !== "tool-calls") {
				text = event.message || pendingText;
			}
			pendingText = "";
		} else if (
			turnStarted &&
			(event.type === "session.waiting" || event.type === "session.completed")
		) {
			session.state.status =
				event.type === "session.completed" ? "completed" : "waiting";
			break;
		} else if (
			turnStarted &&
			(event.type === "turn.failed" || event.type === "session.failed")
		) {
			session.state.status = "failed";
			throw new Error(event.message);
		}
	}
	if (sawEvent) {
		await upsertEveSession({
			db,
			env: session.env,
			orgId,
			sessionId: session.sessionId,
			state: session.state,
			threadKey: session.threadKey,
		});
	}
	return {
		chained,
		chainedSiblingRequestIds,
		deferredEmptyTurn: turnStarted && !(sawTurnActivity || text || pendingText),
		question,
		text: text || pendingText,
	};
};
