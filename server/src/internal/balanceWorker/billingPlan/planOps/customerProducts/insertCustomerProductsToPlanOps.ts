import {
	type BillingPlanOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import { customerEntitlementToPlanOps } from "../customerEntitlements/customerEntitlementToPlanOps.js";

/** The product row first, then the prices and grants that reference it. License pools are not the worker's. */
const customerProductToPlanOps = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): BillingPlanOp[] => [
	toBillingPlanInsertOp({ table: "customerProducts", row: customerProduct }),
	...customerProduct.customer_prices.map((customerPrice) =>
		toBillingPlanInsertOp({ table: "customerPrices", row: customerPrice }),
	),
	...customerProduct.customer_entitlements.flatMap((customerEntitlement) =>
		customerEntitlementToPlanOps({ customerEntitlement, customerProduct }),
	),
];

export const insertCustomerProductsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	autumnBillingPlan.insertCustomerProducts.flatMap((customerProduct) =>
		customerProductToPlanOps({ customerProduct }),
	);
