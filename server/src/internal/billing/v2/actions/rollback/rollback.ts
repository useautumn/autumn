import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { computeRollbackPlan } from "./computeRollbackPlan";

export const rollback = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const rollbackPlan = computeRollbackPlan({ autumnBillingPlan });
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan: rollbackPlan });
	await deleteCachedFullCustomer({
		ctx,
		customerId: autumnBillingPlan.customerId,
		source: "billing.rollback",
	});
	return rollbackPlan;
};
