import {
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

const freeTrialToCatalogRows = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): CatalogRow[] =>
	customerProduct.free_trial
		? [
				{
					table: "freeTrials",
					row: {
						...customerProduct.free_trial,
						org_id: customerProduct.product.org_id,
						env: customerProduct.product.env,
					},
				},
			]
		: [];

const customerProductToCatalogRows = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): CatalogRow[] => [
	{ table: "products", row: customerProduct.product },
	...freeTrialToCatalogRows({ customerProduct }),
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
