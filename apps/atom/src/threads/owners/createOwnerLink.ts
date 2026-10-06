import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import { pushPhaseMs } from "../../pushes/pushPhaseMs.js";
import { checkRequestToWire, replyToError } from "./ownerCallContract.js";
import { OwnerUnavailableError } from "./ownerUnavailableError.js";
import type { OwnerCallBody, OwnerReply } from "./types/ownerCall.js";
import type { CatalogCalls } from "./types/slotOwners.js";

/** Calls waiting on one owner, per calling thread: past this the owner is behind, and a 503 beats a growing queue. */
const MAX_CALLS_IN_FLIGHT = 256;

/** This thread's line to one other thread: its calls, matched to replies by id. */
export type OwnerLink = {
	processorFor(params: { atomId: string | null }): SlotProcessor;
	catalogFor(params: { atomId: string | null }): CatalogCalls;
	connect(params: { port: MessagePort }): void;
	/** The owner stopped: every call waiting on it fails, and new ones fail at once until it is back. */
	disconnect(): void;
};

export const createOwnerLink = ({
	thread,
	checkSheds,
}: {
	thread: number;
	/** Shed checks per owner thread, shared by every thread so the owner's /health reads its own. */
	checkSheds: Int32Array;
}): OwnerLink => {
	const waiting = new Map<
		number,
		ReturnType<typeof Promise.withResolvers<OwnerReply>>
	>();
	let port: MessagePort | null = null;
	let nextId = 0;

	function receiveReply(event: MessageEvent<OwnerReply>): void {
		const reply = event.data;
		waiting.get(reply.id)?.resolve(reply);
		waiting.delete(reply.id);
	}

	async function call(body: OwnerCallBody): Promise<string | boolean> {
		if (!port || waiting.size >= MAX_CALLS_IN_FLIGHT) {
			if (body.type === "check") Atomics.add(checkSheds, thread, 1);
			throw new OwnerUnavailableError({ thread });
		}
		const id = nextId++;
		const reply = Promise.withResolvers<OwnerReply>();
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
			setSubject: async ({ customerId, body }) => {
				const startedAt = performance.now();
				try {
					return (await call({
						type: "setSubject",
						atomId,
						customerId,
						body,
					})) as boolean;
				} finally {
					pushPhaseMs.hopWait += performance.now() - startedAt;
				}
			},
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
		for (const reply of waiting.values())
			reply.reject(new OwnerUnavailableError({ thread }));
		waiting.clear();
	}

	return { processorFor, catalogFor, connect, disconnect };
};
