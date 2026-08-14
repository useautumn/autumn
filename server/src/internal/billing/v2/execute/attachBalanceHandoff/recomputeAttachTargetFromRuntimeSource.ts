import {
	cusProductToProduct,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyExistingStatesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/applyExisting/applyExistingStatesToCustomerProduct.js";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance.js";

export const recomputeAttachTargetFromRuntimeSource = ({
	ctx,
	fullCustomer,
	sourceCustomerProduct,
	targetCustomerProduct,
	plannedTargetCustomerProduct,
	carryAllConsumableFeatures,
	consumableFeatureIdsToCarry,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	sourceCustomerProduct: FullCusProduct;
	targetCustomerProduct: FullCusProduct;
	plannedTargetCustomerProduct: FullCusProduct;
	carryAllConsumableFeatures?: boolean;
	consumableFeatureIdsToCarry?: string[];
}): FullCusProduct => {
	const workingTarget = structuredClone(targetCustomerProduct);
	const fullProduct = cusProductToProduct({
		cusProduct: plannedTargetCustomerProduct,
	});

	for (const targetCustomerEntitlement of workingTarget.customer_entitlements) {
		const { balance, entities } = initCustomerEntitlementBalance({
			initContext: {
				fullCustomer,
				fullProduct,
				featureQuantities: plannedTargetCustomerProduct.options,
			},
			entitlement: targetCustomerEntitlement.entitlement,
		});
		targetCustomerEntitlement.balance = balance;
		targetCustomerEntitlement.entities = entities;
		targetCustomerEntitlement.adjustment = 0;
		targetCustomerEntitlement.additional_balance = 0;
		targetCustomerEntitlement.rollovers = [];
	}

	applyExistingStatesToCustomerProduct({
		ctx,
		fullCustomer,
		customerProduct: workingTarget,
		existingUsagesConfig: {
			fromCustomerProduct: sourceCustomerProduct,
			carryAllConsumableFeatures,
			consumableFeatureIdsToCarry,
		},
		existingRolloversConfig: {
			fromCustomerProduct: sourceCustomerProduct,
		},
	});

	return workingTarget;
};
