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

	const [chargeResults, refundResults] = await Promise.all([
		Promise.all(
			customerProductIds.map((cusProductId) =>
				invoiceLineItemRepo.getByCustomerProductAndPeriod({
					db,
					customerProductId: cusProductId,
					direction: "charge",
				}),
			),
		),
		Promise.all(
			customerProductIds.map((cusProductId) =>
				invoiceLineItemRepo.getByCustomerProductAndPeriod({
					db,
					customerProductId: cusProductId,
					direction: "refund",
				}),
			),
		),
	]);

	return {
		storedChargeLineItems: deduplicateById(chargeResults.flat()),
		storedRefundLineItems: deduplicateById(refundResults.flat()),
	};
};
