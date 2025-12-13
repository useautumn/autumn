import {
	type EntitlementWithFeature,
	entToPrice,
	type InsertFullCusProductContext,
	isPayPerUsePrice,
} from "@autumn/shared";
import { isArrearPrice } from "../../../../products/prices/priceUtils/usagePriceUtils/classifyUsagePrice";

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

	return isArrearPrice({ price }) || isPayPerUsePrice({ price });
};
