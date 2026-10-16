import {
	type BillingContext,
	cusProductToEnts,
	cusProductToPrices,
	type FullCusProduct,
	type MultiAttachBillingContext,
} from "@autumn/shared";

const isMultiAttachContext = (
	billingContext: BillingContext,
): billingContext is MultiAttachBillingContext =>
	"productContexts" in billingContext;

/**
 * Whether this plan itself carries customizations. A multi-attach's `isCustom` spans every plan,
 * and the same plan can repeat across entities, so match the plan's own custom price and entitlement ids.
 */
export const planIsCustomized = ({
	billingContext,
	customerProduct,
}: {
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): boolean => {
	if (customerProduct.is_custom) return true;
	if (!isMultiAttachContext(billingContext)) {
		return Boolean(billingContext.isCustom);
	}

	const customIds = new Set(
		billingContext.productContexts.flatMap(({ customPrices, customEnts }) => [
			...customPrices.map(({ id }) => id),
			...customEnts.map(({ id }) => id),
		]),
	);
	return [
		...cusProductToPrices({ cusProduct: customerProduct }),
		...cusProductToEnts({ cusProduct: customerProduct }),
	].some(({ id }) => customIds.has(id));
};
