import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	isCustomerProductAddOn,
	isCustomerProductOneOff,
	orgPersistFreeOverage,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { oneOffPrepaidCusEntsByFeatureId } from "@/internal/billing/v2/utils/handleOneOffPrepaidCarryOvers/cusProductToOneOffPrepaidCarryOvers";

export type OneOffPurchaseRebalance = {
	purchases: {
		customerEntitlementId: string;
		featureId: string;
		quantity: number;
	}[];
};

export const computeOneOffPurchaseRebalance = ({
	ctx,
	newCustomerProduct,
}: {
	ctx: AutumnContext;
	newCustomerProduct: FullCusProduct;
}): OneOffPurchaseRebalance | undefined => {
	if (!orgPersistFreeOverage({ org: ctx.org })) return undefined;
	if (!isCustomerProductAddOn(newCustomerProduct)) return undefined;
	if (!isCustomerProductOneOff(newCustomerProduct)) return undefined;
	if (!customerProductHasActiveStatus(newCustomerProduct)) return undefined;

	const purchases = Array.from(
		oneOffPrepaidCusEntsByFeatureId(newCustomerProduct),
	).flatMap(([featureId, customerEntitlement]) => {
		const quantity = customerEntitlement.balance ?? 0;
		if (quantity <= 0) return [];

		customerEntitlement.balance = 0;
		return [
			{ customerEntitlementId: customerEntitlement.id, featureId, quantity },
		];
	});

	return purchases.length > 0 ? { purchases } : undefined;
};
