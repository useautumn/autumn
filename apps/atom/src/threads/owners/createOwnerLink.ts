import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import { checkRequestToWire, replyToError } from "./ownerCallContract.js";
import { OwnerUnavailableError } from "./ownerUnavailableError.js";
import type { OwnerCallBody, OwnerReply } from "./types/ownerCall.js";
import type { CatalogCalls } from "./types/slotOwners.js";

/** Calls waiting on one owner, per calling thread: above the push receiver's in-flight cap, so a burst of pushes queues here, never 503s. */
const MAX_CALLS_IN_FLIGHT = 512;
/** A call unanswered this long is failed: the owner is wedged, and a 503 lets the API answer instead. Swept once a second. */
const CALL_DEADLINE_MS = 5_000;
const SWEEP_EVERY_MS = 1_000;

type WaitingCall = ReturnType<typeof Promise.withResolvers<OwnerReply>> & {
	sentAt: number;
};

/** This thread's line to one other thread: its calls, matched to replies by id. */
export type OwnerLink = {
	processorFor(params: { atomId: string | null }): SlotProcessor;
	catalogFor(params: { atomId: string | null }): CatalogCalls;
	connect(params: { port: MessagePort }): void;
	/** The owner stopped: every call waiting on it fails, and new ones fail at once until it is back. */
	disconnect(): void;
};

export const createOwnerLink = ({ thread }: { thread: number }): OwnerLink => {
	const waiting = new Map<number, WaitingCall>();
	let port: MessagePort | null = null;
	let nextId = 0;

	function receiveReply(event: MessageEvent<OwnerReply>): void {
		const reply = event.data;
		waiting.get(reply.id)?.resolve(reply);
		waiting.delete(reply.id);
	}

	function failCallsSentBefore(cutoff: number): void {
		for (const [id, call] of waiting)
			if (call.sentAt < cutoff) {
				waiting.delete(id);
				call.reject(new OwnerUnavailableError({ thread }));
			}
	}

	async function call(body: OwnerCallBody): Promise<string | boolean> {
		// Never shed a catalog install: a thread that missed one answers from the old catalog until the next push.
		const shed =
			body.type !== "installCatalog" && waiting.size >= MAX_CALLS_IN_FLIGHT;
		if (!port || shed) throw new OwnerUnavailableError({ thread });
		const id = nextId++;
		const reply = {
			...Promise.withResolvers<OwnerReply>(),
			sentAt: Date.now(),
		};
		waiting.set(id, reply);
		const message = { id, ...body };
		port.postMessage(
			message.type === "setSubject" ? message : JSON.stringify(message),
		);
		const answered = await reply.promise;
		if (!answered.ok) throw replyToError(answered);
		return answered.value;
	}

	function processorFor({ atomId }: { atomId: string | null }): SlotProcessor {
		return {
			check: async ({ request }) =>
				(await call({
					type: "check",
					atomId,
					request: checkRequestToWire({ request }),
				})) as string,
			setSubject: async ({ customerId, body }) =>
				(await call({
					type: "setSubject",
					atomId,
					customerId,
					body,
				})) as boolean,
		};
	}

	function catalogFor({ atomId }: { atomId: string | null }): CatalogCalls {
		return {
			setCatalog: async (catalog) =>
				(await call({ type: "setCatalog", atomId, catalog })) as boolean,
			installCatalog: async (catalog) =>
				(await call({ type: "installCatalog", atomId, catalog })) as boolean,
		};
	}

	function connect({ port: next }: { port: MessagePort }): void {
		port = next;
		port.onmessage = receiveReply;
	}

	function disconnect(): void {
		port?.close();
		port = null;
		failCallsSentBefore(Number.POSITIVE_INFINITY);
	}

	const sweep = setInterval(
		() => failCallsSentBefore(Date.now() - CALL_DEADLINE_MS),
		SWEEP_EVERY_MS,
	);
	sweep.unref();

	return { processorFor, catalogFor, connect, disconnect };
};
