import type { Context } from "hono";
import { HandoffSchema } from "../../replicas/handover/handoffContract.js";
import type { HandedEntry } from "../../state/journal/types/journal.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

/** A customer's owed entries from the replica that owned it: held by the slot's owner thread, then its waiting requests go on. */
export const receiveJournalHandoff = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "peer">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const parsed = HandoffSchema.safeParse(context.get("body"));
		if (!parsed.success)
			return context.json(
				{
					message: "A handoff names its customer and entries",
					code: "invalid_request",
				},
				400,
			);
		const { customerId, entries } = parsed.data;
		// On its way out itself: the sender keeps them and drains them to Autumn instead.
		if (ctx.peer.membership?.isSelfLeaving())
			return context.json(
				{ message: "This replica is leaving too", code: "atom_leaving" },
				503,
			);
		const held = await context
			.get("slots")
			.processorFor({ customerId })
			.receiveHandoff({ customerId, entries: entries as HandedEntry[] });
		return context.json(held);
	};
