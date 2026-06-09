import {
	type AutumnBillingPlan,
	cusProductToProduct,
	type InsertCustomerEntitlement,
	type PatchContext,
	type TrialContext,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyCustomerProductItemsPatch } from "./applyCustomerProductItemsPatch";
import { initPatchedCustomerEntitlementsAndPrices } from "./initPatchedCustomerEntitlementsAndPrices";

type CustomerProductUpdates = NonNullable<
	NonNullable<AutumnBillingPlan["updateCustomerProducts"]>[number]["updates"]
>;

const applyTrialContextToPatchedCustomerProduct = ({
	customerProduct,
	trialContext,
}: {
	customerProduct: PatchContext["finalCustomerProduct"];
	trialContext?: TrialContext;
}): CustomerProductUpdates => {
	if (!trialContext) return {};

	if (trialContext.customFreeTrial) {
		customerProduct.free_trial = trialContext.customFreeTrial;
		customerProduct.free_trial_id = trialContext.customFreeTrial.id;
		customerProduct.trial_ends_at = trialContext.trialEndsAt ?? null;

		return {
			free_trial_id: customerProduct.free_trial_id,
			trial_ends_at: customerProduct.trial_ends_at,
		};
	}

	if (trialContext.trialEndsAt === null) {
		customerProduct.free_trial = null;
		customerProduct.free_trial_id = null;
		customerProduct.trial_ends_at = null;

		return {
			free_trial_id: null,
			trial_ends_at: null,
		};
	}

	return {};
};

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
	customerProductUpdates: CustomerProductUpdates;
	oneOffPrepaidCarryOverCustomerEntitlements: InsertCustomerEntitlement[];
} => {
	const {
		customerPrices,
		customerEntitlements,
		oneOffPrepaidCarryOverEntitlements,
		oneOffPrepaidCarryOverCustomerEntitlements,
	} =
		initPatchedCustomerEntitlementsAndPrices({
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

	// Patch-style customization always carries custom items (setupPatchContext
	// only runs when isCustomizePlanPatchStyle is true). Flip is_custom on the
	// customer_product so version migrations skip it.
	const customUpdates = billingContext.isCustom
		? { is_custom: true }
		: {};
	if (billingContext.isCustom) {
		patchContext.finalCustomerProduct.is_custom = true;
	}

	return {
		finalCustomerProduct: patchContext.finalCustomerProduct,
		customerProductUpdates: {
			options: patchContext.finalCustomerProduct.options,
			...trialUpdates,
			...customUpdates,
		},
		oneOffPrepaidCarryOverCustomerEntitlements,
	};
};
