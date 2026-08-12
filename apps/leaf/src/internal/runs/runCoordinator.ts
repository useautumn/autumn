import { logger } from "../../lib/logger.js";
import { getRun } from "./runRegistry.js";

const STOP_KEYWORDS = new Set([
	"abort",
	"cancel",
	"cancel that",
	"stop",
	"stop it",
	"stop please",
]);

const MAX_PENDING_TURNS = 5;

export const isStopMessage = (text: string) =>
	STOP_KEYWORDS.has(
		text
			.trim()
			.toLowerCase()
			.replace(/[.!]+$/, ""),
	);

// Replaces the chat SDK queue under `concurrency: "concurrent"`: new runs are
// serialized per thread, while messages arriving mid-run are routed live —
// stop keywords interrupt, everything else is injected as the next turn.
const newRunTails = new Map<string, Promise<void>>();
const queuedCounts = new Map<string, number>();

/** Whether a newer message is already queued behind the active run — the
 * active run should fold its reply into the next turn instead of posting. */
export const hasQueuedThreadMessage = (runKey: string) =>
	(queuedCounts.get(runKey) ?? 0) > 0;

/** Runs `task` after the thread's current run, and holds the thread until it
 * finishes — the engine can't drive two turns on one session. */
export const runExclusiveThreadTask = async <T>({
	runKey,
	task,
}: {
	runKey: string;
	task: () => Promise<T>;
}): Promise<T> => {
	const tail = newRunTails.get(runKey) ?? Promise.resolve();
	const result = tail.then(task);
	// The tail must never reject, or every task queued behind it is skipped.
	const next = result.then(
		() => undefined,
		() => undefined,
	);
	newRunTails.set(runKey, next);
	try {
		return await result;
	} finally {
		if (newRunTails.get(runKey) === next) newRunTails.delete(runKey);
	}
};

export const dispatchThreadMessage = async ({
	hasAttachments,
	onFollowUpInjected,
	providerUserId,
	runKey,
	runNewMessage,
	text,
}: {
	hasAttachments: boolean;
	onFollowUpInjected?: () => Promise<void> | void;
	providerUserId: string;
	runKey: string;
	runNewMessage: () => Promise<void>;
	text: string;
}) => {
	const active = getRun(runKey);
	if (active && !(active.closed || active.stop)) {
		if (isStopMessage(text)) {
			logger.info("Stop keyword received for active run", {
				event: "leaf.run_stop_keyword",
				data: { run_key: runKey },
			});
			await active.logAction?.(`Stopping — requested by <@${providerUserId}>…`);
			await active.requestStop({ byUserId: providerUserId, reason: "user" });
			return;
		}

		const injectable =
			active.kind === "message" &&
			active.ownerProviderUserId === providerUserId &&
			!hasAttachments &&
			active.pendingTurns < MAX_PENDING_TURNS;

		if (injectable) {
			try {
				await active.injectFollowUp({ text });
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
	queuedCounts.set(runKey, (queuedCounts.get(runKey) ?? 0) + 1);
	await runExclusiveThreadTask({
		runKey,
		task: async () => {
			const remaining = (queuedCounts.get(runKey) ?? 1) - 1;
			if (remaining > 0) queuedCounts.set(runKey, remaining);
			else queuedCounts.delete(runKey);
			await runNewMessage();
		},
	}).catch(() => {});
};
