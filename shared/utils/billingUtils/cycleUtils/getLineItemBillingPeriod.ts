import type { BillingPeriod } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { isOneOffPrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { getCycleEnd } from "./getCycleEnd";
import { getCycleStart } from "./getCycleStart";

export const getLineItemBillingPeriod = ({
	anchor,
	price,
	now,
}: {
	anchor: number;
	price: Price;
	now: number;
}): BillingPeriod | undefined => {
	if (isOneOffPrice(price)) return undefined;

	const { interval, interval_count: intervalCount } = price.config;
	return {
		start: getCycleStart({
			anchor,
			interval: price.config.interval,
			intervalCount: price.config.interval_count,
			now,
		}),

		end: getCycleEnd({
			anchor,
			interval,
			intervalCount,
			now,
		}),
	};
};
