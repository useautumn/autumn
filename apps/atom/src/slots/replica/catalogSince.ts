import type { CatalogRows } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** The catalog's rows when they were read after `readAtAfter`, for a peer copying them; null otherwise. */
export const catalogSince = ({
	ctx,
	readAtAfter,
}: {
	ctx: ReplicaSlotsContext;
	readAtAfter: number;
}): CatalogRows | null => {
	const held = ctx.catalogStore.rows();
	return held && held.readAt > readAtAfter ? held : null;
};
