import {
	type BillingPlanOp,
	toBillingPlanUpdateOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations.js";
import { withDefinedColumns } from "../utils/withDefinedColumns.js";

export const updateCustomerProductsToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	getUpdateCustomerProducts({ autumnBillingPlan }).flatMap(
		({ customerProduct, updates }) => {
			const set = withDefinedColumns({ updates });
			if (!set) return [];
			return [
				toBillingPlanUpdateOp({
					table: "customerProducts",
					id: customerProduct.id,
					set,
				}),
			];
		},
	);
