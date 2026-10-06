import type { Queue, QueueMessage } from "@alienplatform/bindings";
import {
	type AtomPushMessage,
	AtomPushType,
	payloadToAtomPushMessage,
} from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../auth/types/auth.js";
import type { ProcessStatsRecorder } from "../init/processStats.js";
import type { Slots } from "../slots/types/slots.js";
import { applyCatalogPush, applySubjectPush } from "./applyPushes.js";
import { pushPhaseMs } from "./pushPhaseMs.js";
import type { PushReceiver } from "./types/pushReceiver.js";

/** The queue `packages/alien/stacks/byoc/alien.json` links to Atom. */
export const PUSH_QUEUE = "pushes";
/** SQS's most per receive. */
const RECEIVE_BATCH = 10;
/** Long polls in flight per receiving thread, so applying one batch never waits on the next receive. */
const RECEIVE_LOOPS = 4;
/** After a failed receive, so an unreachable queue is not polled in a tight loop. */
const RECEIVE_RETRY_MS = 1_000;

/** How the receive loop is bounded: pushes received and not yet acked, and how long one receive may take. */
type PushReceiverLimits = {
	/** Past this many, receiving waits for one to finish: a hung ack holds one slot, not the loop. */
	maxPushesInFlight: number;
	/** Above SQS's 20 s long poll: a receive still pending is left to finish on its own, and receiving goes on. */
	receiveDeadlineMs: number;
};

const DEFAULT_LIMITS: PushReceiverLimits = {
	maxPushesInFlight: 400,
	receiveDeadlineMs: 25_000,
};

type PushReceiverContext = {
	pushes: Pick<Queue, "receive" | "ack">;
	auth: Pick<Auth, "slotsFor">;
	logger: Pick<AutumnLogger, "warn">;
	sleep?: (ms: number) => Promise<unknown>;
	processStats?: Pick<ProcessStatsRecorder, "recordRequest">;
};

/** An Alien error carries its code and the context of the call that failed; the message alone hides the cause. */
const errorDetails = (error: unknown) =>
	error instanceof Error
		? {
				code: "code" in error ? error.code : undefined,
				context: "context" in error ? error.context : undefined,
				cause: error.cause,
			}
		: { value: String(error) };

/** Null for a payload no Autumn sent: SQS would deliver it forever, so it is acked and logged instead. */
const decodePush = ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: QueueMessage;
}): AtomPushMessage | null => {
	const parseStartedAt = performance.now();
	try {
		return payloadToAtomPushMessage({ payload: message.payload });
	} catch (error) {
		ctx.logger.warn(
			{ error, type: "atom_push_invalid" },
			"A queued push could not be read; it was dropped",
		);
		return null;
	} finally {
		pushPhaseMs.parse += performance.now() - parseStartedAt;
	}
};

/** The same apply the HTTP routes run; it throws only on a failure that may pass, so SQS delivers the push again. */
const applyPush = async ({
	ctx,
	push,
	slots,
	bytes,
}: {
	ctx: PushReceiverContext;
	push: AtomPushMessage;
	slots: Slots;
	bytes: number;
}): Promise<void> => {
	const applyStartedAt = performance.now();
	if (push.type === AtomPushType.SetSubject)
		await applySubjectPush({ slots, body: push.body });
	else await applyCatalogPush({ slots, body: push.body });
	const durationMs = performance.now() - applyStartedAt;
	pushPhaseMs.apply += durationMs;
	ctx.processStats?.recordRequest({
		path: `/v1/${push.type}`,
		durationMs,
		forwarded: false,
		bytes,
		ageMs: Date.now() - push.readAt,
	});
};

/** Whether the message is done with: applied on the thread that owns its customer, or never applicable. */
const receivePush = async ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: QueueMessage;
}): Promise<boolean> => {
	const push = decodePush({ ctx, message });
	if (!push) return true;
	const slots = ctx.auth.slotsFor({ atomId: push.atomId });
	if (!slots) {
		ctx.logger.warn(
			{ type: "atom_push_unrouted", data: { atomId: push.atomId } },
			"A queued push names no folder this Atom holds; it was dropped",
		);
		return true;
	}
	try {
		await applyPush({ ctx, push, slots, bytes: message.payload.length });
		return true;
	} catch (error) {
		ctx.logger.warn(
			{
				error,
				type: "atom_push_failed",
				data: { attempt: message.attempt, ...errorDetails(error) },
			},
			"A queued push was not applied; SQS will deliver it again",
		);
		return false;
	}
};

/** Applied, then acked; a push that may still apply later is left for SQS to deliver again. */
const settlePush = async ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: QueueMessage;
}): Promise<void> => {
	if (!(await receivePush({ ctx, message }))) return;
	await ctx.pushes
		.ack(message.receiptHandle)
		.catch((error) =>
			ctx.logger.warn(
				{ error, type: "atom_push_ack_failed", data: errorDetails(error) },
				"An applied push was not acked; SQS will deliver it again",
			),
		);
};

const RECEIVE_TIMED_OUT = Symbol("receiveTimedOut");

/**
 * Autumn's pushes read from the org's own queue, so nothing has to reach Atom from outside. Each loop only receives:
 * every push is settled as its own task, so one slow apply or ack never holds up the pushes behind it.
 */
export const createPushReceiver = ({
	ctx,
	limits = DEFAULT_LIMITS,
}: {
	ctx: PushReceiverContext;
	limits?: PushReceiverLimits;
}): PushReceiver => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const inFlight = new Set<Promise<void>>();
	let stopping = false;

	function settle(message: QueueMessage): void {
		const task = settlePush({ ctx, message }).finally(() =>
			inFlight.delete(task),
		);
		inFlight.add(task);
	}

	function receiveBatch(): Promise<QueueMessage[]> {
		return ctx.pushes.receive(RECEIVE_BATCH).catch(async (error) => {
			ctx.logger.warn(
				{ error, type: "atom_push_receive_failed", data: errorDetails(error) },
				"Receiving queued pushes failed; trying again",
			);
			await sleep(RECEIVE_RETRY_MS);
			return [];
		});
	}

	/** A receive past the deadline is not abandoned: whatever it returns later is still settled. */
	async function receiveWithinDeadline(): Promise<QueueMessage[]> {
		const received = receiveBatch();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<typeof RECEIVE_TIMED_OUT>((resolve) => {
			timer = setTimeout(
				() => resolve(RECEIVE_TIMED_OUT),
				limits.receiveDeadlineMs,
			);
		});
		const result = await Promise.race([received, deadline]);
		clearTimeout(timer);
		if (result !== RECEIVE_TIMED_OUT) return result;
		ctx.logger.warn(
			{ type: "atom_push_receive_slow", data: limits },
			"A receive of queued pushes is still pending; receiving again",
		);
		void received.then((messages) => messages.forEach(settle));
		return [];
	}

	async function receiveUntilStopped(): Promise<void> {
		while (!stopping) {
			while (inFlight.size >= limits.maxPushesInFlight)
				await Promise.race(inFlight);
			for (const message of await receiveWithinDeadline()) settle(message);
		}
	}

	return {
		/** Resolves once every loop has stopped and every push it received is settled. */
		run: async () => {
			await Promise.all(
				Array.from({ length: RECEIVE_LOOPS }, receiveUntilStopped),
			);
			await Promise.all(inFlight);
		},
		stop: () => {
			stopping = true;
		},
	};
};
