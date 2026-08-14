import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { db } from "../../lib/db.js";
import type { AgentOutput } from "../../types.js";
import type { EveTurnOutcome } from "./applyEveEvent.js";
import { deleteEveSession } from "./repo.js";
import type { EveSessionRef } from "./types.js";

/** Shapes a finished turn into the harness's output. Dropping the session row
 * also drops the thread from the dashboard, so only `unreachable` earns it. */
export const resolveEveTurnOutcome = async ({
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
}): Promise<AgentOutput> => {
	const runId = session.sessionId;

	if (outcome.kind === "stopped") {
		return {
			env,
			finishReason: "stopped",
			stopReason: outcome.stopReason,
			text: outcome.text,
		};
	}
	if (outcome.kind === "suspended") {
		return { env, runId, suspensions: outcome.suspensions, text: outcome.text };
	}
	if (outcome.kind === "parked") {
		return { env, question: outcome.question, runId, text: outcome.text };
	}
	if (outcome.kind === "answered") {
		return {
			env,
			catalogDecision: outcome.catalogDecision
				? { plan: outcome.catalogDecision }
				: undefined,
			runId,
			text: outcome.text,
		};
	}

	logger.warn("Eve session produced no reply", {
		event: "leaf.eve_session_no_reply",
		data: { ended_on: outcome.kind, session_id: runId },
	});
	if (outcome.kind === "unreachable") {
		await deleteEveSession({
			db,
			env,
			orgId,
			sessionId: runId,
			threadKey: session.threadKey,
		});
	}
	return { env, runId, text: "" };
};
