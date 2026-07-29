import type { ExistingRollover, FullCusProduct } from "@shared/index";
import { customerEntitlementToBillingType } from "@shared/utils/cusEntUtils/convertCusEntUtils/customerEntitlementToBillingType";

export const cusProductToExistingRollovers = ({
	cusProduct,
}: {
	cusProduct?: FullCusProduct;
}): ExistingRollover[] => {
	if (!cusProduct) return [];

	const cusEnts = cusProduct.customer_entitlements;

	const existingRollovers: ExistingRollover[] = [];

	for (const cusEnt of cusEnts) {
		const rollovers = cusEnt.rollovers;
		if (!rollovers) continue;

		const sourceBillingType =
			customerEntitlementToBillingType({
				cusEnt: { ...cusEnt, customer_product: cusProduct },
			}) ?? null;

		existingRollovers.push(
			...rollovers.map((rollover) => {
				return {
					...rollover,
					internal_feature_id: cusEnt.entitlement.internal_feature_id,
					source_billing_type: sourceBillingType,
					source_interval: cusEnt.entitlement.interval,
					source_interval_count: cusEnt.entitlement.interval_count,
				};
			}),
		);
	}

	return existingRollovers;
};
