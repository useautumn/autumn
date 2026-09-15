import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listFullCustomerProductsByIds } from "@/internal/licenses/repos/listFullCustomerProductsByIds";

/** Rows a plan wants to insert that already exist, in any status. */
export const loadPlannedCustomerProducts = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<FullCusProduct[]> =>
	listFullCustomerProductsByIds({
		db: ctx.db,
		customerProductIds: autumnBillingPlan.insertCustomerProducts.map(
			(customerProduct) => customerProduct.id,
		),
	});
