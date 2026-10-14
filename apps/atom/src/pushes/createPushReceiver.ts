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
import type { Replication } from "../replication/types/replication.js";
import type { ThreadCounters } from "../threads/stats/threadStats.js";
import {
	applyCatalogPush,
	applyDeletePush,
	applySubjectPush,
} from "./applyPushes.js";
import type { PushReceiver } from "./types/pushReceiver.js";

const RECEIVE_LOOPS = 4;
const RECEIVE_RETRY_MS = 1_000;
const MAX_PUSHES_IN_FLIGHT = 400;
export const MAX_PUSH_ATTEMPTS = 10;

type PushReceiverContext = {
	pushQueue: PushQueue;
	auth: Pick<Auth, "slotsFor">;
	logger: Pick<AutumnLogger, "warn">;
	counters?: Pick<ThreadCounters, "add">;
	replication: Replication;
	sleep?: (ms: number) => Promise<unknown>;
};

const isAbort = (error: unknown): boolean =>
	error instanceof Error && error.name === "AbortError";

const readPush = ({ message }: { message: PulledPush }): QueuedAtomPush => {
	try {
		return payloadToQueuedAtomPush(message);
	} catch (cause) {
		throw new InvalidPushError("A queued push could not be decoded", {
			cause,
		});
	}
};

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
		await applyCatalogPush({
			slots,
			body: push.body,
			replication: ctx.replication,
		});
		return;
	}
	if (push.customerId === null)
		throw new InvalidPushError(`A queued ${push.type} push names no customer`);
	const apply =
		push.type === AtomPushType.DeleteSubject
			? applyDeletePush
			: applySubjectPush;
	await apply({
		slots,
		customerId: push.customerId,
		body: push.body,
		replication: ctx.replication,
	});
};

const receivePush = async ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: PulledPush;
}): Promise<boolean> => {
	ctx.counters?.add("pushes");
	if (message.attempt > MAX_PUSH_ATTEMPTS) {
		ctx.counters?.add("pushesDropped");
		ctx.logger.warn(
			{ type: "atom_push_dropped", data: { attempt: message.attempt } },
			"A queued push failed every try; it was dropped, and Autumn's next push or a pull corrects it",
		);
		return true;
	}
	try {
		await applyPush({ ctx, push: readPush({ message }) });
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

export const createPushReceiver = ({
	ctx,
	maxPushesInFlight = MAX_PUSHES_IN_FLIGHT,
}: {
	ctx: PushReceiverContext;
	maxPushesInFlight?: number;
}): PushReceiver => {
	const sleep = ctx.sleep ?? Bun.sleep;
	const inFlight = new Set<Promise<void>>();
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
		run: async () => {
			await Promise.all(
				Array.from({ length: RECEIVE_LOOPS }, receiveUntilStopped),
			);
			await Promise.all(inFlight);
		},
		stop: () => stopped.abort(),
	};
};
