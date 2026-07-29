import {
	type EntitlementWithFeature,
	entToPrice,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isPayPerUsePrice,
} from "@autumn/shared";

export const initCustomerEntitlementUsageAllowed = ({
	initContext,
	initOptions,
	entitlement,
}: {
	initContext: InitCustomerEntitlementContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
}) => {
	// Assignments never bill — no overage regardless of price.
	if (initOptions?.customerLicenseLinkId) return false;

	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct?.prices ?? [],
	});

	if (!price) return false;

	return isPayPerUsePrice({ price });
};
