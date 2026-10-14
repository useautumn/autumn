import type {
	AttachBillingContext,
	MultiAttachBillingContext,
	MultiAttachProductContext,
} from "@autumn/shared";

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
	fullCustomer: productContext.fullCustomer,
	attachProduct: productContext.fullProduct,
	fullProducts: [productContext.fullProduct],
	featureQuantities: productContext.featureQuantities,
	customerLicenseQuantities: productContext.customerLicenseQuantities,
	customPrices: productContext.customPrices,
	customEnts: productContext.customEnts,
	currentCustomerProduct:
		currentCustomerProductOverride ?? productContext.currentCustomerProduct,
	scheduledCustomerProduct: productContext.scheduledCustomerProduct,
	planTiming: "immediate",
	externalId: productContext.externalId,
});
