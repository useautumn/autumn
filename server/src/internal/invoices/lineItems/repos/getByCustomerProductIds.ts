import {
	type DbInvoiceLineItem,
	InvoiceStatus,
	invoiceLineItems,
	invoices,
} from "@autumn/shared";
import { and, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";

const ALL_DIRECTIONS = ["charge", "refund"] as const;

/**
 * Fetch all line items whose customer_product_ids array overlaps any of the
 * given ids, in a single query (jsonb `?|` array-overlap, GIN-indexed).
 * Rows on a voided invoice are skipped: a reissued invoice carries its own copy.
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

	const rows = await db
		.select({ lineItem: invoiceLineItems })
		.from(invoiceLineItems)
		.leftJoin(invoices, sql`${invoices.id} = ${invoiceLineItems.invoice_id}`)
		.where(
			and(
				inArray(invoiceLineItems.direction, [...directions]),
				sql`${invoiceLineItems.customer_product_ids} ?| ARRAY[${sql.join(
					customerProductIds.map((id) => sql`${id}`),
					sql`, `,
				)}]::text[]`,
				or(isNull(invoices.id), ne(invoices.status, InvoiceStatus.Void)),
			),
		);

	return rows.map((row) => row.lineItem);
};
