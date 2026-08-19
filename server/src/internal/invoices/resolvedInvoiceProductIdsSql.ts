import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * Current public plan ids for an invoice row, looked up from `products`
 * via `internal_product_ids`. Deleted products fall back to the snapshot
 * stored on the invoice. Alias is a FROM alias we control (`i` / `ci`).
 */
export const resolvedInvoiceProductIdsSql = ({
	internalProductIds,
	productIds,
}: {
	internalProductIds: SQLWrapper;
	productIds: SQLWrapper;
}): SQL<string[]> => sql`
	COALESCE(
		(
			SELECT array_agg(COALESCE(p.id, snap.product_id) ORDER BY snap.ord)
			FROM unnest(
				COALESCE(${internalProductIds}, ARRAY[]::text[]),
				COALESCE(${productIds}, ARRAY[]::text[])
			) WITH ORDINALITY AS snap(internal_id, product_id, ord)
			LEFT JOIN products p ON p.internal_id = snap.internal_id
		),
		COALESCE(${productIds}, ARRAY[]::text[])
	)
`;

/** Invoice row as JSON with `product_ids` replaced by current public plan ids. */
export const invoiceJsonWithCurrentPlanIdsSql = (alias: "i" | "ci"): SQL =>
	sql`(to_jsonb(${sql.raw(alias)}) || jsonb_build_object(
		'product_ids',
		${resolvedInvoiceProductIdsSql({
			internalProductIds: sql.raw(`${alias}.internal_product_ids`),
			productIds: sql.raw(`${alias}.product_ids`),
		})}
	))`;
