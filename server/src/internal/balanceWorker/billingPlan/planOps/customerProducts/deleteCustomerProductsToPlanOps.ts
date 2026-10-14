import {
	type BillingPlanOp,
	toBillingPlanDeleteOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";

export const deleteCustomerProductsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	getDeleteCustomerProducts({ autumnBillingPlan }).map(({ id }) =>
		toBillingPlanDeleteOp({ table: "customerProducts", id }),
	);
