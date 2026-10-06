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
/** Long polls in flight per writer process, so applying one batch never waits on the next receive. */
const RECEIVE_LOOPS = 4;

type PushReceiverContext = {
	pushes: Pick<Queue, "receive" | "ack">;
	auth: Pick<Auth, "pushSlots">;
	logger: Pick<AutumnLogger, "warn">;
	processStats?: Pick<ProcessStatsRecorder, "recordRequest">;
};

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
const applyPush = ({
	ctx,
	push,
	slots,
	bytes,
}: {
	ctx: PushReceiverContext;
	push: AtomPushMessage;
	slots: Slots;
	bytes: number;
}): void => {
	const applyStartedAt = performance.now();
	if (push.type === AtomPushType.SetSubject)
		applySubjectPush({ slots, body: push.body });
	else applyCatalogPush({ slots, body: push.body });
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

/** Whether the message is done with: applied, or never applicable. */
const receivePush = ({
	ctx,
	message,
}: {
	ctx: PushReceiverContext;
	message: QueueMessage;
}): boolean => {
	const push = decodePush({ ctx, message });
	if (!push) return true;
	const slots = ctx.auth.pushSlots({ atomId: push.atomId });
	if (!slots) {
		ctx.logger.warn(
			{ type: "atom_push_unrouted", data: { atomId: push.atomId } },
			"A queued push names no folder this Atom holds; it was dropped",
		);
		return true;
	}
	try {
		applyPush({ ctx, push, slots, bytes: message.payload.length });
		return true;
	} catch (error) {
		ctx.logger.warn(
			{ error, type: "atom_push_failed", data: { attempt: message.attempt } },
			"A queued push was not applied; SQS will deliver it again",
		);
		return false;
	}
};

/** Autumn's pushes read from the org's own queue, so nothing has to reach Atom from outside. */
export const createPushReceiver = ({
	ctx,
}: {
	ctx: PushReceiverContext;
}): PushReceiver => {
	const { pushes } = ctx;
	let stopping = false;

	async function receiveUntilStopped(): Promise<void> {
		while (!stopping) {
			const messages = await pushes.receive(RECEIVE_BATCH);
			const done = messages.filter((message) => receivePush({ ctx, message }));
			await Promise.all(
				done.map((message) =>
					pushes
						.ack(message.receiptHandle)
						.catch((error) =>
							ctx.logger.warn(
								{ error, type: "atom_push_ack_failed" },
								"An applied push was not acked; SQS will deliver it again",
							),
						),
				),
			);
		}
	}

	return {
		run: async () => {
			await Promise.all(
				Array.from({ length: RECEIVE_LOOPS }, receiveUntilStopped),
			);
		},
		stop: () => {
			stopping = true;
		},
	};
};
