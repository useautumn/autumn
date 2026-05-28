import type {
	FullCustomerEntitlement,
	FullCustomerPrice,
	PatchContext,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { enrichEntitlementsWithFeatures } from "@shared/utils/productUtils/entUtils/enrichEntitlement";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getCustomerProductCarryGroups } from "@/internal/billing/v2/utils/initFullCustomerProduct/carryExisting";
import { applyExistingStatesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/applyExisting/applyExistingStatesToCustomerProduct";
import { initCustomerEntitlement } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlement";
import { initCustomerPrice } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerPrice";
import { applyOneOffPrepaidCarryOvers } from "../../handleOneOffPrepaidCarryOvers/applyOneOffPrepaidCarryOvers";

type PatchInitBillingContext = Pick<
	UpdateSubscriptionBillingContext,
	| "fullCustomer"
	| "featureQuantities"
	| "resetCycleAnchorMs"
	| "currentEpochMs"
	| "trialContext"
	| "skipExistingUsageCarry"
>;

export const initPatchedCustomerEntitlementsAndPrices = ({
	ctx,
	billingContext,
	patchContext,
}: {
	ctx: AutumnContext;
	billingContext: PatchInitBillingContext;
	patchContext: PatchContext;
}): {
	customerPrices: FullCustomerPrice[];
	customerEntitlements: FullCustomerEntitlement[];
} => {
	const {
		fullCustomer,
		featureQuantities,
		resetCycleAnchorMs,
		currentEpochMs,
		trialContext,
		skipExistingUsageCarry,
	} = billingContext;
	const {
		customPrices,
		customEntitlements,
		finalCustomerProduct,
		fullProduct,
	} = patchContext;

	const customerPrices = customPrices.map((price) => ({
		...initCustomerPrice({
			fullCus: fullCustomer,
			price,
			cusProductId: finalCustomerProduct.id,
		}),
		price,
	}));

	const entitlementsWithFeatures = enrichEntitlementsWithFeatures({
		entitlements: customEntitlements,
		features: ctx.features,
	});

	const customerEntitlements = entitlementsWithFeatures.map((entitlement) => ({
		...initCustomerEntitlement({
			initContext: {
				fullCustomer,
				fullProduct,
				featureQuantities,
				resetCycleAnchor: resetCycleAnchorMs,
				freeTrial: trialContext?.freeTrial ?? null,
				trialEndsAt: trialContext?.trialEndsAt ?? undefined,
				now: currentEpochMs,
			},
			entitlement,
			cusProductId: finalCustomerProduct.id,
		}),
		entitlement,
		replaceables: [],
		rollovers: [],
	}));

	const customerProductWithNewItemsOnly = {
		...finalCustomerProduct,
		customer_prices: customerPrices,
		customer_entitlements: customerEntitlements,
	};
	const carryGroups = getCustomerProductCarryGroups({
		fromCustomerProduct: patchContext.originalCustomerProduct,
		toCustomerProduct: customerProductWithNewItemsOnly,
		fromCustomerEntitlements: patchContext.deleteCustomerEntitlements,
	});

	for (const carryGroup of carryGroups) {
		applyExistingStatesToCustomerProduct({
			ctx,
			fullCustomer,
			customerProduct: carryGroup.toCustomerProduct,
			existingUsagesConfig: skipExistingUsageCarry
				? undefined
				: {
						fromCustomerProduct: carryGroup.fromCustomerProduct,
						carryAllConsumableFeatures: true,
					},
			existingRolloversConfig: {
				fromCustomerProduct: carryGroup.fromCustomerProduct,
			},
		});

		applyOneOffPrepaidCarryOvers({
			oldCustomerProduct: carryGroup.fromCustomerProduct,
			newCustomerProduct: carryGroup.toCustomerProduct,
			fullCustomer,
		});
	}

	return {
		customerPrices: customerProductWithNewItemsOnly.customer_prices,
		customerEntitlements: customerProductWithNewItemsOnly.customer_entitlements,
	};
};
