import {
	type BillingPlanOp,
	toBillingPlanDeleteOp,
	toBillingPlanInsertOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { applyCustomerProductPatch } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { customerEntitlementToPlanOps } from "../customerEntitlements/customerEntitlementToPlanOps.js";

type PatchCustomerProduct = NonNullable<
	AutumnBillingPlan["patchCustomerProducts"]
>[number];

/** A product's items rewritten in place: new grants and prices in, old ones out, as `executePatchCustomerProducts` writes them. */
const patchToPlanOps = ({
	patch,
}: {
	patch: PatchCustomerProduct;
}): BillingPlanOp[] => {
	const patchedCustomerProduct = applyCustomerProductPatch({
		customerProduct: patch.customerProduct,
		patch,
	});
	return [
		...patch.insertCustomerEntitlements.flatMap((customerEntitlement) =>
			customerEntitlementToPlanOps({
				customerEntitlement,
				customerProduct: patchedCustomerProduct,
			}),
		),
		...patch.insertCustomerPrices.map((customerPrice) =>
			toBillingPlanInsertOp({ table: "customerPrices", row: customerPrice }),
		),
		...patch.deleteCustomerPrices.map(({ id }) =>
			toBillingPlanDeleteOp({ table: "customerPrices", id }),
		),
		...patch.deleteCustomerEntitlements.map(({ id }) =>
			toBillingPlanDeleteOp({ table: "customerEntitlements", id }),
		),
	];
};

export const patchCustomerProductsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.patchCustomerProducts ?? []).flatMap((patch) =>
		patchToPlanOps({ patch }),
	);
