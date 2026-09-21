import { ms } from "@autumn/shared";
import { logger } from "../../lib/logger.js";
import type { AgentTurnSpeaker } from "../agentRuntime/domain/agentTurnContext.js";

const SESSION_RESOLVE_TIMEOUT_MS = ms.seconds(15);

export type RunStopReason = "user";

/** A message folded into the run's live eve session mid-turn. */
export type FollowUpMessage = Readonly<{
	speaker?: AgentTurnSpeaker;
	text: string;
}>;

/** How the run reaches its eve session; bound once the session is known. */
export type RunTransport = Readonly<{
	sendInterrupt?: (sessionId: string) => Promise<void>;
	sendUserMessage?: (
		input: FollowUpMessage & { sessionId: string },
	) => Promise<void>;
}>;

export type ActiveRun = {
	/** Aborts the locally-consumed turn stream so a stop lands immediately. */
	abortTurnStream?: () => void;
	/** Silences run progress (ticker/typing) the moment a stop is requested. */
	onStop?: () => void;
	/** Set by the pump once it stops consuming turns — no more injections. */
	closed?: boolean;
	/** Posts the text into the live session; eve's steer policy cancels the
	 * active turn and restarts it with every buffered message in context. */
	injectFollowUp: (input: FollowUpMessage) => Promise<void>;
	key: string;
	kind: "approval" | "message";
	logAction?: (message: string) => Promise<void> | void;
	ownerProviderUserId: string;
	pendingTurns: number;
	requestStop: (input: {
		byUserId: string;
		reason: RunStopReason;
	}) => Promise<void>;
	resolveSessionId: (sessionId: string, transport?: RunTransport) => void;
	sessionId: Promise<string>;
	/** The turn settled locally and nobody reads the stream any more: a message
	 * posted now would run unread. Set the instant the reader returns, before
	 * the reply or approval card is presented, so late arrivals queue instead. */
	settle: () => void;
	settling?: boolean;
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

export const registerRun = ({
	key,
	kind,
	ownerProviderUserId,
	sendInterrupt,
	sendUserMessage,
}: {
	key: string;
	kind: ActiveRun["kind"];
	ownerProviderUserId: string;
	sendInterrupt?: RunTransport["sendInterrupt"];
	sendUserMessage?: RunTransport["sendUserMessage"];
}): ActiveRun => {
	let resolveFirstSessionId!: (sessionId: string) => void;
	const sessionId = new Promise<string>((resolve) => {
		resolveFirstSessionId = resolve;
	});
	let interruptSent = false;
	// A harness can re-home a run onto a new session mid-flight, and the promise
	// only ever resolves once — so interrupts read the latest id, not the first.
	let latestSessionId: string | undefined;
	let transport: RunTransport = { sendInterrupt, sendUserMessage };
	const resolveSessionId = (id: string, bound?: RunTransport) => {
		latestSessionId = id;
		if (bound) transport = { ...transport, ...bound };
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

	const assertAcceptingFollowUps = () => {
		if (run.closed || run.stop) throw new Error("Run is closing");
		if (run.settling) throw new Error("Run is settling");
	};

	const run: ActiveRun = {
		key,
		kind,
		ownerProviderUserId,
		pendingTurns: 0,
		resolveSessionId,
		sessionId,
		startedAt: Date.now(),
		injectFollowUp: async (input) => {
			assertAcceptingFollowUps();
			const resolved = await resolveSessionIdOrNull();
			if (!resolved) throw new Error("Session is not ready yet");
			assertAcceptingFollowUps();
			const send = transport.sendUserMessage;
			if (!send) throw new Error("Run has no follow-up transport");
			run.pendingTurns += 1;
			try {
				// No separate interrupt: the post itself steers, so the cancel and
				// the replacement message travel as one durable command.
				await send({ ...input, sessionId: resolved });
			} catch (error) {
				run.pendingTurns -= 1;
				throw error;
			}
		},
		requestStop: async ({ byUserId, reason }) => {
			if (run.stop) return;
			run.stop = { byUserId, reason };
			run.onStop?.();
			run.abortTurnStream?.();
			if (interruptSent) return;
			interruptSent = true;
			// The session id may never resolve if the run failed during setup.
			const resolved = await resolveSessionIdOrNull();
			if (!resolved) return;
			try {
				await (transport.sendInterrupt ?? defaultSendInterrupt)(resolved);
			} catch (error) {
				logger.warn("Could not interrupt session for stop request", {
					event: "leaf.run_stop_interrupt_failed",
					data: { run_key: key, session_id: resolved },
					error,
				});
			}
		},
		settle: () => {
			run.settling = true;
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
