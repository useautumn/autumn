import {
	type EntitlementWithFeature,
	entToPrice,
	type InsertFullCusProductContext,
	isPayPerUsePrice,
} from "@autumn/shared";

export const initCusEntUsageAllowed = ({
	insertContext,
	entitlement,
}: {
	insertContext: InsertFullCusProductContext;
	entitlement: EntitlementWithFeature;
}) => {
	const price = entToPrice({
		ent: entitlement,
		prices: insertContext.product.prices,
	});

	if (!price) return false;

	return isPayPerUsePrice({ price });
};
