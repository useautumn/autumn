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
	/** Resolves once every follow-up post that is mid-flight has been accepted
	 * or has failed; undefined when none is. A reservation is taken before the
	 * post, so the count alone says a message was attempted, not that eve took
	 * it — the reader waits on this so its claim reflects what eve actually
	 * accepted. */
	followUpPostsInFlight: () => Promise<void> | undefined;
	/** One synchronous step, so no injection can be accepted in between:
	 * claims the follow-ups eve has already taken for this run and returns
	 * true, or closes the run to further injections and returns false. The
	 * reader calls it at every turn boundary — a claim means a replacement
	 * turn is coming and it must keep reading, because the message is already
	 * posted and its reply would otherwise run with nobody attached. */
	claimFollowUpsOrSettle: () => boolean;
	/** A follow-up that lands mid-turn makes eve cancel that turn and start a
	 * replacement holding every message it has taken. So a follow-up eve had
	 * accepted before a cancel the reader sees is answered by the next turn
	 * start. The reader calls this on each `turn.cancelled`. */
	noteTurnCancelled: () => void;
	/** Covers the follow-ups armed by `noteTurnCancelled`; without it a
	 * follow-up folded into the reply it is waiting on reads as still owed
	 * after that reply. A start with no cancel after the accept does not
	 * cover: that turn may predate the message (a reader running behind eve),
	 * and the message then gets its own turn, claimed at the boundary. A post
	 * still in flight at the cancel stays owed, for the same reason. */
	coverAcceptedFollowUps: () => void;
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

	// Reservations are taken before the post lands, so a reader that is about
	// to stop needs to know an answer is still outstanding.
	const inFlightPosts = new Set<Promise<unknown>>();
	// Accepted posts wait for a cancel, then for the replacement's start. A
	// claim hands every reservation to the reader at once, so it opens a new
	// generation: a post that lands after the claim was already counted and
	// must not count again.
	let acceptedFollowUps = 0;
	let coverableFollowUps = 0;
	let claimGeneration = 0;

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
			const generation = claimGeneration;
			// No separate interrupt: the post itself steers, so the cancel and
			// the replacement message travel as one durable command.
			const post = send({ ...input, sessionId: resolved });
			inFlightPosts.add(post);
			try {
				await post;
				if (generation === claimGeneration) acceptedFollowUps += 1;
			} catch (error) {
				// The reader may have claimed this reservation while the post was
				// in flight, which would already have zeroed the count.
				if (generation === claimGeneration) {
					run.pendingTurns = Math.max(0, run.pendingTurns - 1);
				}
				throw error;
			} finally {
				inFlightPosts.delete(post);
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
		followUpPostsInFlight: () =>
			inFlightPosts.size === 0
				? undefined
				: // allSettled: a failed post is an answer too, and its own caller
					// owns the rejection.
					Promise.allSettled([...inFlightPosts]).then(() => undefined),
		claimFollowUpsOrSettle: () => {
			// Synchronous on purpose. injectFollowUp increments pendingTurns in
			// the same synchronous block as its last settling check, so between
			// that block and this one there is no point where a message can be
			// posted to eve while this reader is on its way out.
			if (run.pendingTurns > 0) {
				// eve may fold several buffered messages into one replacement
				// turn, so claim them all; anything injected after this claim is
				// caught by the next boundary.
				run.pendingTurns = 0;
				acceptedFollowUps = 0;
				coverableFollowUps = 0;
				claimGeneration += 1;
				return true;
			}
			run.settling = true;
			return false;
		},
		noteTurnCancelled: () => {
			coverableFollowUps += acceptedFollowUps;
			acceptedFollowUps = 0;
		},
		coverAcceptedFollowUps: () => {
			run.pendingTurns = Math.max(0, run.pendingTurns - coverableFollowUps);
			coverableFollowUps = 0;
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
