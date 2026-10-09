import {
	customerEntitlements,
	customerLicenses,
	customerPrices,
	customerProducts,
	type FullCusProduct,
} from "@autumn/shared";
import { sql } from "drizzle-orm";

// Everything the derivation reads, so products with equal fingerprints share a flag.
// isCustomFingerprintOf must build the same string from a loaded product.
export const isCustomFingerprintSql = sql<string>`concat_ws(
	'|',
	${customerProducts.internal_product_id},
	${customerProducts.processor}->>'type',
	(SELECT string_agg(${customerEntitlements.entitlement_id}, ',' ORDER BY ${customerEntitlements.entitlement_id} COLLATE "C")
		FROM ${customerEntitlements} WHERE ${customerEntitlements.customer_product_id} = ${customerProducts.id}),
	(SELECT string_agg(${customerPrices.price_id}, ',' ORDER BY ${customerPrices.price_id} COLLATE "C")
		FROM ${customerPrices} WHERE ${customerPrices.customer_product_id} = ${customerProducts.id}),
	(SELECT string_agg(coalesce(${customerLicenses.plan_license_id}, '-'), ',' ORDER BY coalesce(${customerLicenses.plan_license_id}, '-') COLLATE "C")
		FROM ${customerLicenses} WHERE ${customerLicenses.parent_customer_product_id} = ${customerProducts.id})
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
