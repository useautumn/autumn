import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import type { AgentTurnResult } from "../../../domain/agentTurn.js";
import { deleteEveSession } from "../../../eve/repo.js";
import type { EveSessionRef } from "../../../eve/types.js";
import type { EveTurnOutcome } from "../execute/eveTurnReducer.js";

// Deleting the session also removes the dashboard thread.
export const resolveAgentTurnOutcome = async ({
	env,
	logger,
	orgId,
	outcome,
	session,
}: {
	env: AppEnv;
	logger: AutumnLogger;
	orgId: string;
	outcome: EveTurnOutcome;
	session: EveSessionRef;
}): Promise<AgentTurnResult> => {
	const sessionId = session.sessionId;

	if (outcome.kind === "stopped") {
		return {
			kind: "stopped",
			reason: outcome.stopReason,
			sessionId,
			text: outcome.text,
		};
	}
	if (outcome.kind === "suspended") {
		return {
			approval: outcome.approval,
			kind: "approval",
			sessionId,
			text: outcome.text,
		};
	}
	if (outcome.kind === "parked") {
		return outcome.question
			? {
					kind: "question",
					question: outcome.question,
					sessionId,
					text: outcome.text,
				}
			: { kind: "reply", sessionId, text: outcome.text };
	}
	if (outcome.kind === "answered") {
		return outcome.catalogDecision
			? {
					kind: "catalog_decision",
					plan: outcome.catalogDecision,
					sessionId,
					text: outcome.text,
				}
			: { kind: "reply", sessionId, text: outcome.text };
	}

	logger.warn("Eve session produced no reply", {
		event: "leaf.eve_session_no_reply",
		data: { ended_on: outcome.kind, session_id: sessionId },
	});
	if (outcome.kind === "unreachable") {
		await deleteEveSession({
			db,
			env,
			orgId,
			sessionId,
			threadKey: session.threadKey,
		});
	}
	return { kind: "empty", sessionId };
};
