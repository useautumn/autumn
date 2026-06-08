import { type DbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

export const getByCustomerProductAndPeriod = async ({
	db,
	customerProductId,
	direction,
	priceId,
	periodStartMs,
	periodEndMs,
}: {
	db: DrizzleCli;
	customerProductId: string;
	direction: "charge" | "refund";
	priceId?: string;
	periodStartMs?: number;
	periodEndMs?: number;
}): Promise<DbInvoiceLineItem[]> => {
	const conditions = [
		eq(invoiceLineItems.direction, direction),
		sql`${invoiceLineItems.customer_product_ids}::jsonb @> ${JSON.stringify([customerProductId])}::jsonb`,
	];

	if (priceId) {
		conditions.push(eq(invoiceLineItems.price_id, priceId));
	}

	if (periodStartMs !== undefined) {
		conditions.push(
			lte(invoiceLineItems.effective_period_start, periodStartMs),
		);
	}

	if (periodEndMs !== undefined) {
		conditions.push(gte(invoiceLineItems.effective_period_end, periodEndMs));
	}

	return db
		.select()
		.from(invoiceLineItems)
		.where(and(...conditions));
};
