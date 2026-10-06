import type { CheckResponseV3 } from "@autumn/shared";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import { checkRequestToWire, replyToError } from "./ownerCallContract.js";
import { OwnerUnavailableError } from "./ownerUnavailableError.js";
import type { OwnerCallBody, OwnerReply } from "./types/ownerCall.js";

/** Calls waiting on one owner, per calling thread: past this the owner is behind, and a 503 beats a growing queue. */
const MAX_CALLS_IN_FLIGHT = 256;

/** This thread's line to one other thread: its calls, matched to replies by id. */
export type OwnerLink = {
	processorFor(params: { atomId: string | null }): SlotProcessor;
	connect(params: { port: MessagePort }): void;
	/** The owner stopped: every call waiting on it fails, and new ones fail at once until it is back. */
	disconnect(): void;
};

export const createOwnerLink = ({ thread }: { thread: number }): OwnerLink => {
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

	async function call(body: OwnerCallBody): Promise<CheckResponseV3 | boolean> {
		if (!port || waiting.size >= MAX_CALLS_IN_FLIGHT)
			throw new OwnerUnavailableError({ thread });
		const id = nextId++;
		const reply = Promise.withResolvers<OwnerReply>();
		waiting.set(id, reply);
		port.postMessage({ id, ...body });
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
				})) as CheckResponseV3,
			setSubject: async ({ subject }) =>
				(await call({ type: "setSubject", atomId, subject })) as boolean,
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

	return { processorFor, connect, disconnect };
};
