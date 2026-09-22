import { logger } from "../../lib/logger.js";
import type { AgentTurnSpeaker } from "../agentRuntime/domain/agentTurnContext.js";
import { getRun } from "./runRegistry.js";

const MAX_PENDING_TURNS = 5;

/** Stops the thread's in-flight run, if any; returns whether one was stopped. */
export const stopActiveThreadRun = async ({
	byUserId,
	runKey,
}: {
	byUserId: string;
	runKey: string;
}) => {
	const active = getRun(runKey);
	if (!active || active.closed || active.stop) return false;
	logger.info("Stopping active run for thread opt-out", {
		event: "leaf.run_stop_opt_out",
		data: { run_key: runKey },
	});
	await active.requestStop({ byUserId, reason: "user" });
	return true;
};

// Replaces the chat SDK queue under `concurrency: "concurrent"`: new runs are
// serialized per thread, while messages arriving mid-run are routed live —
// stop keywords interrupt, everything else is posted into the live session,
// where eve's steer policy restarts the turn with every message in context.
const newRunTails = new Map<string, Promise<void>>();

export const dispatchThreadMessage = async <Result>({
	hasAttachments,
	onFollowUpInjected,
	origin = "user",
	providerUserId,
	runKey,
	runNewMessage,
	speaker,
	text,
}: {
	hasAttachments: boolean;
	onFollowUpInjected?: () => Promise<void> | void;
	/** A system notice (an applied approval's outcome) belongs to the thread,
	 * not to whoever is speaking, so it merges into anyone's active run. */
	origin?: "system" | "user";
	providerUserId: string;
	runKey: string;
	runNewMessage: () => Promise<Result>;
	speaker?: AgentTurnSpeaker;
	text: string;
}): Promise<Result | undefined> => {
	const active = getRun(runKey);
	// A settling run has no reader left on its stream: a message posted into
	// it would run unread, so it waits for the run to close and starts fresh.
	if (active && !(active.closed || active.stop || active.settling)) {
		const injectable =
			(origin === "system" || active.ownerProviderUserId === providerUserId) &&
			!hasAttachments &&
			active.pendingTurns < MAX_PENDING_TURNS;

		if (injectable) {
			try {
				await active.injectFollowUp({ speaker, text });
				logger.info("Injected follow-up into active run", {
					event: "leaf.run_follow_up_injected",
					data: { pending_turns: active.pendingTurns, run_key: runKey },
				});
				await onFollowUpInjected?.();
				return;
			} catch (error) {
				logger.warn("Follow-up injection failed; queueing a new run", {
					event: "leaf.run_follow_up_inject_failed",
					data: { run_key: runKey },
					error,
				});
			}
		}
	}

	// New runs (and non-injectable messages) wait for the thread's current
	// run — the engine can't drive two turns on one session.
	const tail = newRunTails.get(runKey) ?? Promise.resolve();
	const result = tail.then(runNewMessage);
	const next = result.then(() => undefined).catch(() => {});
	newRunTails.set(runKey, next);
	try {
		return await result.catch(() => undefined);
	} finally {
		if (newRunTails.get(runKey) === next) newRunTails.delete(runKey);
	}
};
