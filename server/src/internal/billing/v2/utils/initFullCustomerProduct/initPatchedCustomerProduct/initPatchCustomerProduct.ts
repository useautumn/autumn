import {
	cusProductToProduct,
	type PatchContext,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyCustomerProductItemsPatch } from "./applyCustomerProductItemsPatch";
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
}) => {
	const { customerPrices, customerEntitlements } =
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
	patchContext.insertCustomerPrices = customerPrices;
	patchContext.insertCustomerEntitlements = customerEntitlements;
	patchContext.fullProduct = cusProductToProduct({
		cusProduct: patchContext.finalCustomerProduct,
	});

	return patchContext.finalCustomerProduct;
};
