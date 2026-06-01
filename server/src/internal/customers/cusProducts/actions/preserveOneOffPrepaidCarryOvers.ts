import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusProductToOneOffPrepaidCarryOvers } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";

/**
 * Persists any remaining one-off prepaid balances on the outgoing customer
 * product as lifetime cusEnts before the product is expired.
 *
 * Billing-action flows handle this at compute time via the same helper; this
 * action is the webhook-driven equivalent (e.g. Stripe schedule phase advance)
 * where there is no AutumnBillingPlan to attach the rows to. The caller is
 * responsible for surfacing the returned counts in its own structured logs.
 */
export const preserveOneOffPrepaidCarryOvers = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{ preservedCount: number; preservedFeatureIds: string[] }> => {
	const carryOvers = cusProductToOneOffPrepaidCarryOvers({
		currentCustomerProduct: customerProduct,
		fullCustomer,
	});

	if (carryOvers.customerEntitlements.length === 0) {
		return { preservedCount: 0, preservedFeatureIds: [] };
	}

	const preservedFeatureIds = carryOvers.customerEntitlements
		.map((row) => row.feature_id)
		.filter((id): id is string => Boolean(id));

	await EntitlementService.insert({
		db: ctx.db,
		data: carryOvers.entitlements,
	});
	await CusEntService.insert({
		ctx,
		data: carryOvers.customerEntitlements,
	});

	return {
		preservedCount: carryOvers.customerEntitlements.length,
		preservedFeatureIds,
	};
};
