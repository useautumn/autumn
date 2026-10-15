import type { Context } from "hono";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import { RelayedKeysSchema } from "../../replication/keys/createKeyRelay.js";
import type { JournalKeyRow } from "../../state/journal/types/journal.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** Idempotency keys another replica took: each slot's owner thread holds its customers' in one transaction. */
export async function receiveRelayedKeys(context: Context<AtomHttpEnv>) {
	const parsed = RelayedKeysSchema.safeParse(context.get("body"));
	if (!parsed.success)
		return context.json(
			{
				message: "A key relay names customers and their key rows",
				code: "invalid_request",
			},
			400,
		);
	const slots = context.get("slots");
	const bySlot = new Map<SlotProcessor, JournalKeyRow[]>();
	for (const key of parsed.data.keys) {
		const processor = slots.processorFor({ customerId: key.customerId });
		const slotKeys = bySlot.get(processor);
		if (slotKeys) slotKeys.push(key);
		else bySlot.set(processor, [key]);
	}
	const held = await Promise.all(
		[...bySlot].map(([processor, keys]) =>
			processor.receiveRelayedKeys({ keys }),
		),
	);
	return context.json({
		held: held.reduce((sum, { held: n }) => sum + n, 0),
	});
}
