import type { CatalogRows, SubjectSource } from "../types/slots.js";
import { copyNewerRows } from "./copyNewerRows.js";
import { copyRows } from "./copyRows.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/**
 * Copies into the slots this thread owns what `source` holds newer than they do, the catalog included: every row
 * with `window` null (a fresh volume); else only the rows whose digest is newer than the one held.
 */
export const catchUp = async ({
	ctx,
	source,
	window,
	setCatalog,
}: {
	ctx: ReplicaSlotsContext;
	source: SubjectSource;
	window: number | null;
	setCatalog: (params: CatalogRows) => Promise<boolean>;
}): Promise<{ slots: number; written: number }> => {
	const catalog = await source.catalog({
		readAtAfter: ctx.catalogStore.read()?.readAt ?? -1,
	});
	if (catalog) await setCatalog(catalog);
	let written = 0;
	let synced = 0;
	for (const [slot, { sqliteStore: store }] of ctx.slots.entries()) {
		if (!store) continue;
		const copy = { store, source, slot, slotCount: ctx.slotCount };
		written +=
			window === null
				? await copyRows({ ...copy, window })
				: await copyNewerRows({ ...copy, window });
		synced += 1;
	}
	return { slots: synced, written };
};
