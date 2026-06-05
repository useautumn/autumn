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

	const allRows = await invoiceLineItemRepo.getByCustomerProductIds({
		db,
		customerProductIds,
	});

	return {
		storedChargeLineItems: deduplicateById(
			allRows.filter((row) => row.direction === "charge"),
		),
		storedRefundLineItems: deduplicateById(
			allRows.filter((row) => row.direction === "refund"),
		),
	};
};
