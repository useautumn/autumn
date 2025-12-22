import {
	type EntitlementWithFeature,
	entToPrice,
	type InitFullCusProductContext,
	isPayPerUsePrice,
} from "@autumn/shared";

export const initCusEntUsageAllowed = ({
	initContext,
	entitlement,
}: {
	initContext: InitFullCusProductContext;
	entitlement: EntitlementWithFeature;
}) => {
	const price = entToPrice({
		ent: entitlement,
		prices: initContext.product.prices,
	});

	if (!price) return false;

	return isPayPerUsePrice({ price });
};
