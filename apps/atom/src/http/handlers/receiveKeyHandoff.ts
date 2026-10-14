import type { Context } from "hono";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import { decodeHandedKeys } from "../../replicas/handover/handoffContract.js";
import type { HandedKey } from "../../state/journal/types/journal.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** Customers' recent caller keys from the replica they move from: each slot's owner thread logs its customers' in one transaction. */
export async function receiveKeyHandoff(context: Context<AtomHttpEnv>) {
	let keys: HandedKey[];
	try {
		keys = decodeHandedKeys({
			body: new Uint8Array(await context.req.arrayBuffer()),
		});
	} catch {
		return context.json(
			{
				message: "A key handoff is customers and their keys",
				code: "invalid_request",
			},
			400,
		);
	}
	const slots = context.get("slots");
	const bySlot = new Map<SlotProcessor, HandedKey[]>();
	for (const key of keys) {
		const processor = slots.processorFor({ customerId: key.customerId });
		bySlot.set(processor, [...(bySlot.get(processor) ?? []), key]);
	}
	await Promise.all(
		[...bySlot].map(([processor, held]) =>
			processor.receiveHandoff({ handoffs: [], keys: held }),
		),
	);
	return context.json({ held: keys.length });
}
