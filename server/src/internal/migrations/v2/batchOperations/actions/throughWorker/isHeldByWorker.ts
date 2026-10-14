import type { ExpectedProduct } from "@autumn/balance-engine";
import { RELEVANT_STATUSES } from "@autumn/shared";
import type { HeldRow } from "./types/heldRow.js";

const hasWorkerSubject = ({ row }: { row: HeldRow }): boolean =>
	row.ownerInternalEntityId === null || row.ownerEntityId !== null;

const isLoadedByWorker = ({ row }: { row: HeldRow }): boolean =>
	RELEVANT_STATUSES.includes(row.status);

export const isHeldByWorker = ({ row }: { row: HeldRow }): boolean =>
	hasWorkerSubject({ row }) && isLoadedByWorker({ row });

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
