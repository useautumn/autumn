import type {
	BillingContext,
	FullCusProduct,
	MultiAttachBillingContext,
} from "@autumn/shared";

const isMultiAttachContext = (
	billingContext: BillingContext,
): billingContext is MultiAttachBillingContext =>
	"productContexts" in billingContext;

/** Whether this plan itself carries customizations; a multi-attach's `isCustom` spans every plan. */
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

	const productContext = billingContext.productContexts.find(
		({ fullProduct }) =>
			fullProduct.internal_id === customerProduct.internal_product_id,
	);
	return Boolean(
		productContext &&
			(productContext.customPrices.length > 0 ||
				productContext.customEnts.length > 0),
	);
};
