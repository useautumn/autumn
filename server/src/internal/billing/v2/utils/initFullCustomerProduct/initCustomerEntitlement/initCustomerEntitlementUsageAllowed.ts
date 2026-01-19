import {
	type EntitlementWithFeature,
	entToPrice,
	type InitFullCustomerProductContext,
	isPayPerUsePrice,
} from "@autumn/shared";

export const initCustomerEntitlementUsageAllowed = ({
	initContext,
	entitlement,
}: {
	initContext: InitFullCustomerProductContext;
	entitlement: EntitlementWithFeature;
}) => {
	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct.prices,
	});

	if (!price) return false;

	return isPayPerUsePrice({ price });
};
