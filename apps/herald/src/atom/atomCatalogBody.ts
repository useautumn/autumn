import type { CatalogRow } from "@autumn/balance-engine";

/** `POST /v1/catalog.set` and its queued push carry the same body. */
export const toAtomCatalogBody = ({
	rows,
	readAt,
}: {
	rows: CatalogRow[];
	readAt: number;
}) => ({ rows, read_at: readAt });
