import { BillingType, Price } from "@autumn/shared";
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
		let aType = getBillingType(a.config);
		let bType = getBillingType(b.config);
		return BillingTypeOrder.indexOf(aType) - BillingTypeOrder.indexOf(bType);
	});
};
