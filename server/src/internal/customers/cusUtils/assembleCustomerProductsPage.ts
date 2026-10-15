import {
	CusProductStatus,
	CustomerProductsCursor,
	type CustomerProductsPage,
	type CustomerProductsPageItem,
} from "@autumn/shared";
import { normalizeCustomerProductTimeFields } from "../reassembleFlattenedCustomer/normalizeFields.js";

export type RankedCustomerProductRow = Omit<
	CustomerProductsPageItem,
	"phase_starts_at"
> & {
	phase_starts_at: number | string | null;
	status_rank: number;
	scheduled_start: number | string | null;
	entity_rank: number;
};

export const encodeProductsCursor = (row: RankedCustomerProductRow): string =>
	CustomerProductsCursor.encode({
		eRank: row.entity_rank,
		rank: row.status_rank,
		st: Number(row.scheduled_start ?? 0),
		t: Number(row.created_at),
		id: row.id,
	});

/** A later phase row shows the phase: scheduled from its start, like Set Plans lists it. */
const toPageItem = (
	row: RankedCustomerProductRow,
): CustomerProductsPageItem => {
	if (row.phase_starts_at == null) return { ...row, phase_starts_at: null };
	const phaseStartsAt = Number(row.phase_starts_at);
	return {
		...row,
		status: CusProductStatus.Scheduled,
		starts_at: phaseStartsAt,
		phase_starts_at: phaseStartsAt,
	};
};

export const assembleCustomerProductsPage = ({
	rows,
	limit,
	totalCount,
}: {
	rows: RankedCustomerProductRow[];
	limit: number;
	totalCount: number;
}): CustomerProductsPage => {
	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;

	for (const product of pageRows) {
		normalizeCustomerProductTimeFields(product);
		product.customer_prices ??= [];
		product.customer_entitlements ??= [];
	}

	const lastRow = hasMore ? pageRows[pageRows.length - 1] : undefined;
	return {
		list: pageRows.map(toPageItem),
		next_cursor: lastRow ? encodeProductsCursor(lastRow) : null,
		total_count: totalCount,
	};
};
