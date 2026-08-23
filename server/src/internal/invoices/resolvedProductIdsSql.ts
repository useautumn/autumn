import { type AnyColumn, sql } from "drizzle-orm";

/**
 * Current public plan ids for an invoice row, resolved from
 * `internal_product_ids` via the products table. NULL when nothing
 * resolves (legacy rows / deleted products) — consumers fall back to
 * the `product_ids` snapshot.
 */
export const resolvedProductIdsSql = ({
	invoiceAlias,
}: {
	invoiceAlias: string;
}) => sql<string[] | null>`(
	SELECT array_agg(DISTINCT rp.id)
	FROM products rp
	WHERE rp.internal_id = ANY(${sql.raw(`${invoiceAlias}.internal_product_ids`)})
)`;

export const resolvedProductIdsForColumn = ({
	internalProductIds,
}: {
	internalProductIds: AnyColumn;
}) => sql<string[] | null>`(
	SELECT array_agg(DISTINCT rp.id)
	FROM products rp
	WHERE rp.internal_id = ANY(${internalProductIds})
)`;
