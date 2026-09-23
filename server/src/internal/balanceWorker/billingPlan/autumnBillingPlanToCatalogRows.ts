import {
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

const customerProductToCatalogRows = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): CatalogRow[] => [
	{ table: "products", row: customerProduct.product },
	...customerProduct.customer_prices.map(
		({ price }): CatalogRow => ({ table: "prices", row: price }),
	),
	...customerProduct.customer_entitlements.flatMap(
		({ entitlement }): CatalogRow[] => [
			{ table: "entitlements", row: entitlement },
			{ table: "features", row: entitlement.feature },
		],
	),
];

/** A pool's synthetic entitlement and its feature: minted by the plan, so no source has them yet. */
const pooledBalancesToCatalogRows = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): CatalogRow[] =>
	(autumnBillingPlan.pooledBalancePlan?.insertPoolBalances ?? []).flatMap(
		({ entitlement }): CatalogRow[] => [
			{ table: "entitlements", row: entitlement },
			{ table: "features", row: entitlement.feature },
		],
	);

/** The catalog rows the plan's customer products and pools reference, once each; the worker caches them beside the state. */
export const autumnBillingPlanToCatalogRows = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): CatalogRow[] => {
	const customerProducts = [
		...autumnBillingPlan.insertCustomerProducts,
		...getUpdateCustomerProducts({ autumnBillingPlan }).map(
			({ customerProduct }) => customerProduct,
		),
	];
	const rows = [
		...customerProducts.flatMap((customerProduct) =>
			customerProductToCatalogRows({ customerProduct }),
		),
		...pooledBalancesToCatalogRows({ autumnBillingPlan }),
	];
	const rowsByKey = new Map<string, CatalogRow>();
	for (const row of rows) {
		rowsByKey.set(
			catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
			row,
		);
	}
	return [...rowsByKey.values()];
};
