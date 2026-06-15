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
	const tail = newRunTails.get(runKey) ?? Promise.resolve();
	const next = tail.then(runNewMessage).catch(() => {});
	newRunTails.set(runKey, next);
	try {
		await next;
	} finally {
		if (newRunTails.get(runKey) === next) newRunTails.delete(runKey);
	}
};
