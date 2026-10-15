import type { JournalKeyRow } from "../../state/journal/types/journal.js";
import type { SubjectSource } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** Key rows asked of a peer per request: the peer reads cap a page here. */
const KEYS_PAGE = 1_000;

/** Every idempotency key the source took within the key window, page by page, into the journals of the slots this thread owns. */
export const copyRecentKeys = async ({
	ctx,
	source,
}: {
	ctx: ReplicaSlotsContext;
	source: SubjectSource;
}): Promise<number> => {
	let copied = 0;
	for (const [slot, { journal }] of ctx.slots.entries()) {
		if (!journal) continue;
		let after: JournalKeyRow | null = null;
		for (;;) {
			const keys = await source.recentKeys({
				slot,
				slotCount: ctx.slotCount,
				after,
				limit: KEYS_PAGE,
			});
			copied += await journal.receiveKeys({ keys });
			after = keys.at(-1) ?? null;
			if (keys.length < KEYS_PAGE) break;
		}
	}
	return copied;
};
