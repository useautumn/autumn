import { ms } from "@autumn/shared";
import { logger } from "../../lib/logger.js";

const SESSION_RESOLVE_TIMEOUT_MS = ms.seconds(15);

export type RunStopReason = "timeout" | "user";

export type ActiveRun = {
	/** Set by the pump once it stops consuming turns — no more injections. */
	closed?: boolean;
	/** Interrupts the current turn and delivers the text as the next turn. */
	injectFollowUp: (input: { text: string }) => Promise<void>;
	key: string;
	kind: "approval" | "message";
	logAction?: (message: string) => Promise<void> | void;
	ownerProviderUserId: string;
	pendingTurns: number;
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

const defaultSendInterrupt = async () => {};
const defaultSendUserMessage = async () => {
	throw new Error("Eve follow-up injection is queued after the active run");
};

export const registerRun = ({
	key,
	kind,
	ownerProviderUserId,
	sendInterrupt = defaultSendInterrupt,
	sendUserMessage = defaultSendUserMessage,
}: {
	key: string;
	kind: ActiveRun["kind"];
	ownerProviderUserId: string;
	sendInterrupt?: (sessionId: string) => Promise<void>;
	sendUserMessage?: (input: {
		sessionId: string;
		text: string;
	}) => Promise<void>;
}): ActiveRun => {
	let resolveFirstSessionId!: (sessionId: string) => void;
	const sessionId = new Promise<string>((resolve) => {
		resolveFirstSessionId = resolve;
	});
	let interruptSent = false;
	// A harness can re-home a run onto a new session mid-flight, and the promise
	// only ever resolves once — so interrupts read the latest id, not the first.
	let latestSessionId: string | undefined;
	const resolveSessionId = (id: string) => {
		latestSessionId = id;
		resolveFirstSessionId(id);
	};

	const resolveSessionIdOrNull = async () =>
		latestSessionId ??
		(await Promise.race([
			sessionId,
			new Promise<null>((resolve) =>
				setTimeout(() => resolve(null), SESSION_RESOLVE_TIMEOUT_MS),
			),
		]));

	const run: ActiveRun = {
		key,
		kind,
		ownerProviderUserId,
		pendingTurns: 0,
		resolveSessionId,
		sessionId,
		startedAt: Date.now(),
		injectFollowUp: async ({ text }) => {
			if (run.closed || run.stop) throw new Error("Run is closing");
			const resolved = await resolveSessionIdOrNull();
			if (!resolved) throw new Error("Session is not ready yet");
			if (run.closed || run.stop) throw new Error("Run is closing");
			run.pendingTurns += 1;
			try {
				// Interrupt first so the message becomes the very next turn —
				// the user chose immediate pivot over queue-behind-the-turn.
				if (run.kind === "message") await sendInterrupt(resolved);
				await sendUserMessage({ sessionId: resolved, text });
			} catch (error) {
				run.pendingTurns -= 1;
				throw error;
			}
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
	if (runs.get(key) === run) runs.delete(key);
};
