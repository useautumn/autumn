import type { Context } from "hono";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import {
	type Handoff,
	HandoffBatchSchema,
} from "../../replicas/handover/handoffContract.js";
import type { HandedEntry } from "../../state/journal/types/journal.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** Customers' owed entries from the replica that owned them: each slot's owner thread holds its customers' in one transaction. */
export const receiveJournalHandoff = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "peer">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const parsed = HandoffBatchSchema.safeParse(context.get("body"));
		if (!parsed.success)
			return context.json(
				{
					message: "A handoff names its customers and their entries",
					code: "invalid_request",
				},
				400,
			);
		// On its way out itself: the sender keeps them and drains them to Autumn instead.
		if (ctx.peer.membership?.isSelfLeaving())
			return context.json(
				{ message: "This replica is leaving too", code: "atom_leaving" },
				503,
			);
		const slots = context.get("slots");
		const bySlot = new Map<SlotProcessor, Handoff[]>();
		for (const handoff of parsed.data.handoffs) {
			const processor = slots.processorFor({ customerId: handoff.customerId });
			bySlot.set(processor, [...(bySlot.get(processor) ?? []), handoff]);
		}
		const held = await Promise.all(
			[...bySlot].map(([processor, handoffs]) =>
				processor.receiveHandoff({
					handoffs: handoffs.map(({ customerId, entries }) => ({
						customerId,
						entries: entries as HandedEntry[],
					})),
				}),
			),
		);
		return context.json({
			held: held.reduce((sum, { held: n }) => sum + n, 0),
		});
	};
