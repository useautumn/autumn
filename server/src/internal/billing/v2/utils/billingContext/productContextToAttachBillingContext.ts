import type {
	AttachBillingContext,
	MultiAttachBillingContext,
	MultiAttachProductContext,
} from "@autumn/shared";

/** Build an AttachBillingContext from a multi-product billing context and a single product context. */
export const productContextToAttachBillingContext = ({
	billingContext,
	productContext,
	currentCustomerProductOverride,
}: {
	billingContext: MultiAttachBillingContext;
	productContext: MultiAttachProductContext;
	currentCustomerProductOverride?: AttachBillingContext["currentCustomerProduct"];
}): AttachBillingContext => ({
	...billingContext,
	attachProduct: productContext.fullProduct,
	fullProducts: [productContext.fullProduct],
	featureQuantities: productContext.featureQuantities,
	customPrices: productContext.customPrices,
	customEnts: productContext.customEnts,
	currentCustomerProduct:
		currentCustomerProductOverride ?? productContext.currentCustomerProduct,
	scheduledCustomerProduct: productContext.scheduledCustomerProduct,
	planTiming: "immediate",
	externalId: productContext.externalId,
});
