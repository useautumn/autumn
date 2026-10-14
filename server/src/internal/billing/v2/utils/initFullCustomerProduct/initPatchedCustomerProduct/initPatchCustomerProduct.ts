import {
	cusProductToProduct,
	type InsertCustomerEntitlement,
	type PatchContext,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyCustomerProductItemsPatch } from "./applyCustomerProductItemsPatch";
import {
	applyTrialContextToPatchedCustomerProduct,
	type PatchedCustomerProductUpdates,
} from "./applyTrialContextToPatchedCustomerProduct";
import { initPatchedCustomerEntitlementsAndPrices } from "./initPatchedCustomerEntitlementsAndPrices";

export const initPatchCustomerProduct = ({
	ctx,
	billingContext,
	patchContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	patchContext: PatchContext;
}): {
	finalCustomerProduct: PatchContext["finalCustomerProduct"];
	customerProductUpdates: PatchedCustomerProductUpdates;
	oneOffPrepaidCarryOverCustomerEntitlements: InsertCustomerEntitlement[];
} => {
	const {
		customerPrices,
		customerEntitlements,
		oneOffPrepaidCarryOverEntitlements,
		oneOffPrepaidCarryOverCustomerEntitlements,
	} = initPatchedCustomerEntitlementsAndPrices({
		ctx,
		billingContext,
		patchContext,
	});

	const patchedCustomerProduct = applyCustomerProductItemsPatch({
		customerProduct: patchContext.finalCustomerProduct,
		insertCustomerPrices: customerPrices,
		insertCustomerEntitlements: customerEntitlements,
		deleteCustomerPrices: [],
		deleteCustomerEntitlements: [],
	});

	patchContext.finalCustomerProduct.customer_prices =
		patchedCustomerProduct.customer_prices;
	patchContext.finalCustomerProduct.customer_entitlements =
		patchedCustomerProduct.customer_entitlements;
	patchContext.finalCustomerProduct.options = billingContext.featureQuantities;
	const trialUpdates = applyTrialContextToPatchedCustomerProduct({
		customerProduct: patchContext.finalCustomerProduct,
		trialContext: billingContext.trialContext,
	});
	patchContext.insertCustomerPrices = customerPrices;
	patchContext.insertCustomerEntitlements = customerEntitlements;
	patchContext.customEntitlements.push(...oneOffPrepaidCarryOverEntitlements);
	patchContext.fullProduct = cusProductToProduct({
		cusProduct: patchContext.finalCustomerProduct,
	});

	return {
		finalCustomerProduct: patchContext.finalCustomerProduct,
		customerProductUpdates: {
			options: patchContext.finalCustomerProduct.options,
			...trialUpdates,
		},
		oneOffPrepaidCarryOverCustomerEntitlements,
	};
};
