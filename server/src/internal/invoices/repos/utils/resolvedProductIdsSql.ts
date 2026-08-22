import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/**
 * Live public id when the product row exists; snapshot id when that
 * internal id is gone. Partial resolve is not treated as complete.
 */
const resolvedProductIdsMergeSql = ({
	internalProductIds,
	productIds,
}: {
	internalProductIds: SQL | AnyColumn;
	productIds: SQL | AnyColumn;
}) => sql<string[] | null>`(
	SELECT array_agg(COALESCE(rp.id, snap.product_id) ORDER BY snap.ord)
	FROM unnest(${internalProductIds}, ${productIds})
		WITH ORDINALITY AS snap(internal_id, product_id, ord)
	LEFT JOIN products rp ON rp.internal_id = snap.internal_id
)`;

export const resolvedProductIdsSql = ({
	invoiceAlias,
}: {
	invoiceAlias: string;
}) =>
	resolvedProductIdsMergeSql({
		internalProductIds: sql.raw(`${invoiceAlias}.internal_product_ids`),
		productIds: sql.raw(`${invoiceAlias}.product_ids`),
	});

export const resolvedProductIdsForColumn = ({
	internalProductIds,
	productIds,
}: {
	internalProductIds: AnyColumn;
	productIds: AnyColumn;
}) =>
	resolvedProductIdsMergeSql({
		internalProductIds,
		productIds,
	});
