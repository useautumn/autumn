import type { SubjectCursor } from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { SubjectSource } from "../types/slots.js";
import { CATCH_UP_PAGE, FETCH_BATCH } from "./catchUpPage.js";
import { isNewer, writeNewer } from "./writeNewer.js";

/** The digests of what the source wrote since `window`, then only the rows whose version beats the one held. */
export const copyNewerRows = async ({
	store,
	source,
	slot,
	slotCount,
	window,
}: {
	store: SqliteStore;
	source: SubjectSource;
	slot: number;
	slotCount: number;
	window: number;
}): Promise<number> => {
	let written = 0;
	let after: number | null = null;
	let cursor: SubjectCursor | null = null;
	let first = true;
	for (;;) {
		const page = await source.digest({
			slot,
			slotCount,
			after: first ? null : after,
			window: first ? window : null,
			cursor,
			limit: CATCH_UP_PAGE,
		});
		first = false;
		after = page.after;
		const wanted = page.digests.filter((digest) => {
			const held = store.readVersion({
				customerId: digest.customerId,
				entityId: digest.entityId || null,
			});
			return !held || isNewer(digest, held);
		});
		for (let i = 0; i < wanted.length; i += FETCH_BATCH) {
			const keys = wanted
				.slice(i, i + FETCH_BATCH)
				.map(({ customerId, entityId }) => ({ customerId, entityId }));
			written += writeNewer({
				store,
				page: await source.fetch({ slot, slotCount, keys }),
			});
		}
		const last = page.digests.at(-1);
		if (!last || page.digests.length < CATCH_UP_PAGE) break;
		cursor = {
			appliedAt: last.appliedAt,
			customerId: last.customerId,
			entityId: last.entityId,
		};
	}
	return written;
};
