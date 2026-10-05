import {
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";

/** Expires destination plans the incoming plan replaces; no default is activated since the incoming plan fills the group. */
export const expireSupersededCusProducts = async ({
	ctx,
	customerId,
	cusProducts,
}: {
	ctx: AutumnContext;
	customerId: string;
	cusProducts: FullCusProduct[];
}) => {
	if (cusProducts.length === 0) return;
	const endedAt = Date.now();
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId,
			insertCustomerProducts: [],
			updateCustomerProducts: cusProducts.map((customerProduct) => ({
				customerProduct,
				updates: {
					status: CusProductStatus.Expired,
					ended_at: endedAt,
				} as CustomerProductUpdate["updates"],
			})),
		},
	});
};
