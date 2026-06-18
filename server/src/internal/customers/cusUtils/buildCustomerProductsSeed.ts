import type { CustomerProductsPage } from "@autumn/shared";
import {
	assembleCustomerProductsPage,
	type RankedCustomerProductRow,
} from "./assembleCustomerProductsPage.js";

export type CustomerProductsSeedRow = RankedCustomerProductRow & {
	internal_customer_id: string;
	total_count: number;
};

export const buildCustomerProductsSeedByCustomer = ({
	rows,
	limit,
}: {
	rows: CustomerProductsSeedRow[];
	limit: number;
}): Map<string, CustomerProductsPage> => {
	const rowsByCustomer = new Map<string, CustomerProductsSeedRow[]>();
	for (const row of rows) {
		const list = rowsByCustomer.get(row.internal_customer_id);
		if (list) list.push(row);
		else rowsByCustomer.set(row.internal_customer_id, [row]);
	}

	const pageByCustomer = new Map<string, CustomerProductsPage>();
	for (const [internalId, customerRows] of rowsByCustomer) {
		pageByCustomer.set(
			internalId,
			assembleCustomerProductsPage({
				rows: customerRows,
				limit,
				totalCount: customerRows[0]?.total_count ?? customerRows.length,
			}),
		);
	}

	return pageByCustomer;
};
