import {
	AtomPushType,
	payloadToQueuedAtomPush,
	type QueuedAtomPush,
} from "@autumn/byoc";
import type { AutumnLogger } from "@autumn/logging";
import type { Auth } from "../auth/types/auth.js";
import {
	InvalidPushError,
	isUnreadableRequest,
} from "../lib/contracts/invalidPushError.js";
import type { PulledPush, PushQueue } from "../pushQueue/types/pushQueue.js";
import { applyCatalogPush, applySubjectPush } from "./applyPushes.js";
import type { PushReceiver } from "./types/pushReceiver.js";

/** Long polls in flight per receiver, so applying one batch never waits on the next receive. */
const RECEIVE_LOOPS = 4;
/** After a failed receive, so an unreachable queue is not polled in a tight loop. */
const RECEIVE_RETRY_MS = 1_000;
/** Pushes received and not yet acked; past this, receiving waits for one to finish. */
const MAX_PUSHES_IN_FLIGHT = 400;

type PushReceiverContext = {
	pushQueue: PushQueue;
	auth: Pick<Auth, "slotsFor">;
	logger: Pick<AutumnLogger, "warn">;
	sleep?: (ms: number) => Promise<unknown>;
};

/** What a reader that honours the signal throws for a receive aborted on stop. */
const isAbort = (error: unknown): boolean =>
	error instanceof Error && error.name === "AbortError";

/** The same apply the HTTP routes run; it throws only on a failure that may pass, so SQS delivers the push again. */
const applyPush = async ({
	ctx,
	push,
}: {
	ctx: PushReceiverContext;
	push: QueuedAtomPush;
}): Promise<void> => {
	const slots = ctx.auth.slotsFor({ atomId: push.atomId });
	if (!slots) {
		ctx.logger.warn(
			{ type: "atom_push_unrouted", data: { atomId: push.atomId } },
			"A queued push names no folder this Atom holds; it was dropped",
		);
		return;
	}
	if (push.type === AtomPushType.SetCatalog) {
		await applyCatalogPush({ slots, body: JSON.parse(push.body) });
		return;
	}
	if (push.customerId === null)
		throw new InvalidPushError("A queued subjects.set push names no customer");
	await applySubjectPush({
		slots,
		customerId: push.customerId,
		body: push.body,
	});
};

/** Whether the message is done with: applied on the thread that owns its customer, or one that can never apply. */
const receivePush = async ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: PulledPush;
}): Promise<boolean> => {
	try {
		await applyPush({ ctx, push: payloadToQueuedAtomPush(message) });
		return true;
	} catch (error) {
		if (isUnreadableRequest(error)) {
			ctx.logger.warn(
				{ error, type: "atom_push_invalid" },
				"A queued push could not be applied as sent; it was dropped",
			);
			return true;
		}
		ctx.logger.warn(
			{ error, type: "atom_push_failed", data: { attempt: message.attempt } },
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
	message: PulledPush;
}): Promise<void> => {
	if (!(await receivePush({ ctx, message }))) return;
	await ctx.pushQueue
		.ack(message.receiptHandle)
		.catch((error) =>
			ctx.logger.warn(
				{ error, type: "atom_push_ack_failed" },
				"An applied push was not acked; SQS will deliver it again",
			),
		);
};

/**
 * Autumn's pushes read from the org's own queue, so nothing has to reach Atom from outside. Each loop only receives:
 * every push is settled as its own task, so one slow apply or ack never holds up the pushes behind it.
 */
export const createPushReceiver = ({
	ctx,
	maxPushesInFlight = MAX_PUSHES_IN_FLIGHT,
}: {
	ctx: PushReceiverContext;
	maxPushesInFlight?: number;
}): PushReceiver => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const inFlight = new Set<Promise<void>>();
	// Aborted on stop, so a reader that can abort never waits out a long poll with nothing in it.
	const stopped = new AbortController();

	function settle(message: PulledPush): void {
		const task = settlePush({ ctx, message }).finally(() =>
			inFlight.delete(task),
		);
		inFlight.add(task);
	}

	async function receiveBatch(): Promise<PulledPush[]> {
		try {
			return await ctx.pushQueue.pull({ signal: stopped.signal });
		} catch (error) {
			if (isAbort(error)) return [];
			ctx.logger.warn(
				{ error, type: "atom_push_receive_failed" },
				"Receiving queued pushes failed; trying again",
			);
			await sleep(RECEIVE_RETRY_MS);
			return [];
		}
	}

	async function receiveUntilStopped(): Promise<void> {
		while (!stopped.signal.aborted) {
			while (inFlight.size >= maxPushesInFlight) await Promise.race(inFlight);
			for (const message of await receiveBatch()) settle(message);
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
		stop: () => stopped.abort(),
	};
};
