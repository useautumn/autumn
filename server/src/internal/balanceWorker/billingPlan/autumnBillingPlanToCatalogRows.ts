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

/** The catalog rows the plan's customer products reference, once each; the worker caches them beside the state. */
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
	const rowsByKey = new Map<string, CatalogRow>();
	for (const customerProduct of customerProducts) {
		for (const row of customerProductToCatalogRows({ customerProduct })) {
			rowsByKey.set(
				catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
				row,
			);
		}
	}
	return [...rowsByKey.values()];
};
