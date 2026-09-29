import {
	type BillingPlanOp,
	toBillingPlanDeleteOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

/** The worker deletes the product's prices, grants and rollovers with it, as Postgres cascades. */
export const deleteCustomerProductsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	getDeleteCustomerProducts({ autumnBillingPlan }).map(({ id }) =>
		toBillingPlanDeleteOp({ table: "customerProducts", id }),
	);
