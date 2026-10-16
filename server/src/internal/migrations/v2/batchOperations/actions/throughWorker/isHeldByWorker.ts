import type { ExpectedProduct } from "@autumn/balance-engine";
import type { HeldRow } from "./types/heldRow.js";

const hasWorkerSubject = ({ row }: { row: HeldRow }): boolean =>
	row.ownerInternalEntityId === null || row.ownerEntityId !== null;

export const isHeldByWorker = ({ row }: { row: HeldRow }): boolean =>
	hasWorkerSubject({ row }) && row.productLoadedByWorker;

export const ownerEntityIdsOf = ({ rows }: { rows: HeldRow[] }): string[] => [
	...new Set(
		rows.flatMap(({ ownerEntityId }) => (ownerEntityId ? [ownerEntityId] : [])),
	),
];

export const expectedProductOf = ({
	row,
}: {
	row: HeldRow;
}): ExpectedProduct => ({
	columns: {
		internal_product_id: row.internalProductId,
		status: row.status,
		is_custom: row.productIsCustom,
	},
	customerPriceIds: row.customerPriceIds,
});
