import type { CatalogRow } from "@autumn/balance-engine";

export const toAtomCatalogBody = ({
	rows,
	readAt,
}: {
	rows: CatalogRow[];
	readAt: number;
}) => ({ rows, read_at: readAt });
