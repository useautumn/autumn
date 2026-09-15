import { type AutumnBillingPlan, CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { loadPlannedCustomerProducts } from "@/internal/billing/v2/execute/loadPlannedCustomerProducts";

/**
 * True once a previous execution of this plan already promoted a row past
 * Pending — a retry must not re-apply the plan's Stripe changes.
 */
export const hasMaterializedCustomerProducts = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<boolean> => {
	const existingCustomerProducts = await loadPlannedCustomerProducts({
		ctx,
		autumnBillingPlan,
	});

	return existingCustomerProducts.some(
		(customerProduct) => customerProduct.status !== CusProductStatus.Pending,
	);
};
