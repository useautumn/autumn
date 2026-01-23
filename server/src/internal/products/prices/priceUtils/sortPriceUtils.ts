import { BillingType, type Price } from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";

const BillingTypeOrder = [
	BillingType.OneOff,
	BillingType.FixedCycle,
	BillingType.UsageInArrear,
	BillingType.InArrearProrated,
	BillingType.UsageInAdvance,
];

export const sortPricesByType = (prices: Price[]) => {
	return prices.sort((a, b) => {
		const aType = getBillingType(a.config);
		const bType = getBillingType(b.config);
		return BillingTypeOrder.indexOf(aType) - BillingTypeOrder.indexOf(bType);
	});
};
