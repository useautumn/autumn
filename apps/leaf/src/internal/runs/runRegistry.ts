import { ms } from "@autumn/shared";
import { logger } from "../../lib/logger.js";
import type { AgentTurnSpeaker } from "../agentRuntime/domain/agentTurnContext.js";

const SESSION_RESOLVE_TIMEOUT_MS = ms.seconds(15);

export type RunStopReason = "user";

export type FollowUpMessage = Readonly<{
	speaker?: AgentTurnSpeaker;
	text: string;
}>;

export type RunTransport = Readonly<{
	sendInterrupt?: (sessionId: string) => Promise<void>;
	sendUserMessage?: (
		input: FollowUpMessage & { sessionId: string },
	) => Promise<void>;
}>;

export type ActiveRun = {
	abortTurnStream?: () => void;
	onStop?: () => void;
	closed?: boolean;
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
	followUpPostsInFlight: () => Promise<void> | undefined;
	claimFollowUpsOrSettle: () => boolean;
	noteTurnCancelled: () => void;
	coverAcceptedFollowUps: () => void;
	settle: () => void;
	settling?: boolean;
	startedAt: number;
	stop?: { byUserId: string; reason: RunStopReason };
};

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

	const inFlightPosts = new Set<Promise<unknown>>();
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
			const post = send({ ...input, sessionId: resolved });
			inFlightPosts.add(post);
			try {
				await post;
				if (generation === claimGeneration) acceptedFollowUps += 1;
			} catch (error) {
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
				:
					Promise.allSettled([...inFlightPosts]).then(() => undefined),
		claimFollowUpsOrSettle: () => {
			if (run.pendingTurns > 0) {
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

export const closeRun = ({ key, run }: { key: string; run: ActiveRun }) => {
	run.closed = true;
	if (runs.get(key) === run) runs.delete(key);
};
