import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../lib/logger.js";

const client = new Anthropic();

const SESSION_RESOLVE_TIMEOUT_MS = 15_000;

export type RunStopReason = "timeout" | "user";

export type ActiveRun = {
	/** Set by the pump once it stops consuming turns — no more injections. */
	closed?: boolean;
	/** Pump-side: takes every queued follow-up text, emptying the queue. */
	drainFollowUps: () => string[];
	/**
	 * Queues text to run as an upcoming turn. The engine pump is the only
	 * writer of user messages to the session, so it delivers the queue itself
	 * at a turn boundary it observed — the turn count can never desync from
	 * server behavior. Throws once the run is closing.
	 */
	injectFollowUp: (input: { text: string }) => void;
	key: string;
	kind: "approval" | "message";
	logAction?: (message: string) => Promise<void> | void;
	/** Set by the engine pump; fires after a follow-up is queued so a turn in flight can be interrupted. */
	notifyFollowUpQueued?: () => void;
	ownerProviderUserId: string;
	/** Queued follow-up turns not yet delivered to the session. */
	readonly pendingTurns: number;
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
	const followUpQueue: string[] = [];

	const resolveSessionIdOrNull = () =>
		Promise.race([
			sessionId,
			new Promise<null>((resolve) =>
				setTimeout(() => resolve(null), SESSION_RESOLVE_TIMEOUT_MS),
			),
		]);

	const run: ActiveRun = {
		key,
		kind,
		ownerProviderUserId,
		get pendingTurns() {
			return followUpQueue.length;
		},
		resolveSessionId,
		sessionId,
		startedAt: Date.now(),
		drainFollowUps: () => followUpQueue.splice(0),
		injectFollowUp: ({ text }) => {
			// The closed check and the push stay synchronous so they are atomic
			// against the pump's drain-then-close decision on the same event loop.
			if (run.closed || run.stop) throw new Error("Run is closing");
			followUpQueue.push(text);
			run.notifyFollowUpQueued?.();
		},
		requestStop: async ({ byUserId, reason }) => {
			if (run.stop) return;
			run.stop = { byUserId, reason };
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
	run.closed = true;
	if (run.pendingTurns > 0) {
		logger.warn("Closing run with undelivered follow-ups", {
			event: "leaf.run_closed_with_pending_follow_ups",
			data: { pending_turns: run.pendingTurns, run_key: key },
		});
	}
	if (runs.get(key) === run) runs.delete(key);
};
