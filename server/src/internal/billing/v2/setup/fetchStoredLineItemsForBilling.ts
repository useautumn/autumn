import type { DbInvoiceLineItem } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

const deduplicateById = (rows: DbInvoiceLineItem[]): DbInvoiceLineItem[] => {
	const seen = new Set<string>();
	return rows.filter((row) => {
		if (seen.has(row.id)) return false;
		seen.add(row.id);
		return true;
	});
};

export const fetchStoredLineItemsForBilling = async ({
	db,
	customerProductIds,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
}): Promise<{
	storedChargeLineItems: DbInvoiceLineItem[];
	storedRefundLineItems: DbInvoiceLineItem[];
}> => {
	if (customerProductIds.length === 0) {
		return { storedChargeLineItems: [], storedRefundLineItems: [] };
	}

	const queries = customerProductIds.flatMap((customerProductId) =>
		(["charge", "refund"] as const).map((direction) => ({
			customerProductId,
			direction,
		})),
	);

	const results = await Promise.all(
		queries.map(({ customerProductId, direction }) =>
			invoiceLineItemRepo.getByCustomerProductAndPeriod({
				db,
				customerProductId,
				direction,
			}),
		),
	);

	const allRows = results.flat();

	return {
		storedChargeLineItems: deduplicateById(
			allRows.filter((row) => row.direction === "charge"),
		),
		storedRefundLineItems: deduplicateById(
			allRows.filter((row) => row.direction === "refund"),
		),
	};
};
