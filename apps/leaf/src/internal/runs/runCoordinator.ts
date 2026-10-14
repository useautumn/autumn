import { logger } from "../../lib/logger.js";
import type { AgentTurnSpeaker } from "../agentRuntime/domain/agentTurnContext.js";
import { getRun } from "./runRegistry.js";

const MAX_PENDING_TURNS = 5;

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
	origin?: "system" | "user";
	providerUserId: string;
	runKey: string;
	runNewMessage: () => Promise<Result>;
	speaker?: AgentTurnSpeaker;
	text: string;
}): Promise<Result | undefined> => {
	const active = getRun(runKey);
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
