import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../lib/logger.js";
import { FollowUpQueue } from "./followUpQueue.js";

const client = new Anthropic();

const SESSION_RESOLVE_TIMEOUT_MS = 15_000;

export type RunStopReason = "timeout" | "user";

export type ActiveRun = {
	followUps: FollowUpQueue;
	key: string;
	kind: "approval" | "message";
	logAction?: (message: string) => Promise<void> | void;
	ownerProviderUserId: string;
	requestStop: (input: {
		byUserId: string;
		reason: RunStopReason;
	}) => Promise<void>;
	resolveSessionId: (sessionId: string) => void;
	sessionId: Promise<string>;
	startedAt: number;
	stop?: { byUserId: string; reason: RunStopReason };
};

// Process-local: live handles (open stream, progress UI) can't live in a DB
// row, and the bot runs as a singleton. A registry miss degrades to a new run.
const runs = new Map<string, ActiveRun>();

export const runKeyForThread = ({
	channelId,
	provider,
	threadId,
	workspaceId,
}: {
	channelId: string;
	provider: string;
	threadId: string;
	workspaceId: string;
}) => [provider, workspaceId, channelId, threadId].join(":");

const defaultSendInterrupt = async (sessionId: string) => {
	await client.beta.sessions.events.send(sessionId, {
		events: [{ type: "user.interrupt" }],
	});
};

export const registerRun = ({
	key,
	kind,
	ownerProviderUserId,
	sendInterrupt = defaultSendInterrupt,
}: {
	key: string;
	kind: ActiveRun["kind"];
	ownerProviderUserId: string;
	sendInterrupt?: (sessionId: string) => Promise<void>;
}): ActiveRun => {
	let resolveSessionId!: (sessionId: string) => void;
	const sessionId = new Promise<string>((resolve) => {
		resolveSessionId = resolve;
	});
	let interruptSent = false;

	const resolveSessionIdOrNull = () =>
		Promise.race([
			sessionId,
			new Promise<null>((resolve) =>
				setTimeout(() => resolve(null), SESSION_RESOLVE_TIMEOUT_MS),
			),
		]);

	const run: ActiveRun = {
		followUps: new FollowUpQueue(),
		key,
		kind,
		ownerProviderUserId,
		resolveSessionId,
		sessionId,
		startedAt: Date.now(),
		requestStop: async ({ byUserId, reason }) => {
			if (run.stop) return;
			run.stop = { byUserId, reason };
			run.followUps.close();
			if (interruptSent) return;
			interruptSent = true;
			// The session id may never resolve if the run failed during setup.
			const resolved = await resolveSessionIdOrNull();
			if (!resolved) return;
			try {
				await sendInterrupt(resolved);
			} catch (error) {
				logger.warn("Could not interrupt session for stop request", {
					event: "leaf.run_stop_interrupt_failed",
					data: { run_key: key, session_id: resolved },
					error,
				});
			}
		},
	};
	runs.set(key, run);
	return run;
};

export const getRun = (key: string) => runs.get(key);

/** Marks the run inactive and removes the entry only if it still belongs to this run. */
export const closeRun = ({ key, run }: { key: string; run: ActiveRun }) => {
	run.followUps.close();
	if (run.followUps.size > 0) {
		logger.warn("Closing run with undelivered follow-ups", {
			event: "leaf.run_closed_with_pending_follow_ups",
			data: { pending_follow_ups: run.followUps.size, run_key: key },
		});
	}
	if (runs.get(key) === run) runs.delete(key);
};
