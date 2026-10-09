import type { FullCusProduct } from "@autumn/shared";
import { sql } from "drizzle-orm";

// Equal fingerprints share a flag; isCustomFingerprintOf must build the same string.
// Columns are spelled out: Drizzle renders them unqualified, which rebinds them inside the subqueries.
export const isCustomFingerprintSql = sql<string>`concat_ws(
	'|',
	customer_products.internal_product_id,
	customer_products.processor->>'type',
	(SELECT string_agg(ce.entitlement_id, ',' ORDER BY ce.entitlement_id COLLATE "C")
		FROM customer_entitlements ce WHERE ce.customer_product_id = customer_products.id),
	(SELECT string_agg(cpr.price_id, ',' ORDER BY cpr.price_id COLLATE "C")
		FROM customer_prices cpr WHERE cpr.customer_product_id = customer_products.id),
	(SELECT string_agg(coalesce(cl.plan_license_id, '-'), ',' ORDER BY coalesce(cl.plan_license_id, '-') COLLATE "C")
		FROM customer_licenses cl WHERE cl.parent_customer_product_id = customer_products.id)
)`;

// Matches string_agg: nulls skipped, null for no rows, ids sorted in "C" order.
const joinSorted = (ids: (string | null)[]) => {
	const present = ids.filter((id): id is string => id !== null);
	return present.length > 0 ? present.sort().join(",") : null;
};

export const isCustomFingerprintOf = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): string =>
	[
		customerProduct.internal_product_id,
		customerProduct.processor?.type ?? null,
		joinSorted(
			customerProduct.customer_entitlements.map(
				(customerEntitlement) => customerEntitlement.entitlement_id,
			),
		),
		joinSorted(
			customerProduct.customer_prices.map(
				(customerPrice) => customerPrice.price_id,
			),
		),
		joinSorted(
			(customerProduct.customer_licenses ?? []).map(
				(customerLicense) => customerLicense.plan_license_id ?? "-",
			),
		),
	]
		.filter((segment) => segment !== null)
		.join("|");
