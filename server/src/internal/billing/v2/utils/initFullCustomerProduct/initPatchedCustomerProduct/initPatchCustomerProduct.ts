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

/**
 * Materializes the added side of a patch-style custom plan update.
 *
 * `setupPatchContext` has already removed the requested customer prices and
 * entitlements from `finalCustomerProduct` and recorded those rows on the patch
 * context. This function initializes customer rows for `customPrices` and
 * `customEntitlements`, carries usage and rollovers only from the deleted patch
 * items, inserts the new rows into `finalCustomerProduct`, and rebuilds the
 * derived `fullProduct` snapshot from that final customer-product state.
 */
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

	// `is_custom` is not set here: it is derived from the resulting item set in
	// applyDerivedCustomerProductIsCustom, once the plan reaches the executor.

	return {
		finalCustomerProduct: patchContext.finalCustomerProduct,
		customerProductUpdates: {
			options: patchContext.finalCustomerProduct.options,
			...trialUpdates,
		},
		oneOffPrepaidCarryOverCustomerEntitlements,
	};
};
