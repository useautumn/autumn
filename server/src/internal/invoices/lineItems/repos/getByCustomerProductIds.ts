import { type DbInvoiceLineItem, invoiceLineItems } from "@autumn/shared";
import { and, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

const ALL_DIRECTIONS = ["charge", "refund"] as const;

/**
 * Fetch all line items whose customer_product_ids array overlaps any of the
 * given ids, in a single query (jsonb `?|` array-overlap, GIN-indexed).
 */
export const getByCustomerProductIds = async ({
	db,
	customerProductIds,
	directions = ALL_DIRECTIONS,
}: {
	db: DrizzleCli;
	customerProductIds: string[];
	directions?: readonly ("charge" | "refund")[];
}): Promise<DbInvoiceLineItem[]> => {
	if (customerProductIds.length === 0) return [];

	return db
		.select()
		.from(invoiceLineItems)
		.where(
			and(
				inArray(invoiceLineItems.direction, [...directions]),
				sql`${invoiceLineItems.customer_product_ids}::jsonb ?| ${customerProductIds}::text[]`,
			),
		);
};
