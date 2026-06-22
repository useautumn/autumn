import {
	CustomerProductsCursor,
	type CustomerProductsPage,
	type FullCusProduct,
} from "@autumn/shared";
import { normalizeCustomerProductTimeFields } from "../reassembleFlattenedCustomer/normalizeFields.js";

export type RankedCustomerProductRow = FullCusProduct & {
	status_rank: number;
	entity_rank: number;
};

export const encodeProductsCursor = (row: RankedCustomerProductRow): string =>
	CustomerProductsCursor.encode({
		eRank: row.entity_rank,
		rank: row.status_rank,
		t: Number(row.created_at),
		id: row.id,
	});

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
		list: pageRows as FullCusProduct[],
		next_cursor: lastRow ? encodeProductsCursor(lastRow) : null,
		total_count: totalCount,
	};
};
