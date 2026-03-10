import {
	type EntitlementWithFeature,
	entToPrice,
	type InitCustomerEntitlementContext,
	isPayPerUsePrice,
} from "@autumn/shared";

export const initCustomerEntitlementUsageAllowed = ({
	initContext,
	entitlement,
}: {
	initContext: InitCustomerEntitlementContext;
	entitlement: EntitlementWithFeature;
}) => {
	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct?.prices ?? [],
	});

	if (!price) return false;

	return isPayPerUsePrice({ price });
};
