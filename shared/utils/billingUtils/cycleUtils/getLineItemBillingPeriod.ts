import type { BillingPeriod } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { isOneOffPrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { getCycleEnd } from "./getCycleEnd";
import { getCycleStart } from "./getCycleStart";

export const getLineItemBillingPeriod = ({
	anchorMs,
	price,
	nowMs,
}: {
	anchorMs: number | "now";
	price: Price;
	nowMs: number;
}): BillingPeriod | undefined => {
	if (isOneOffPrice(price)) return undefined;

	const { interval, interval_count: intervalCount } = price.config;
	const start = getCycleStart({
		anchor: anchorMs,
		interval,
		intervalCount,
		now: nowMs,
	});
	const end = getCycleEnd({
		anchor: anchorMs,
		interval,
		intervalCount,
		now: nowMs,
	});

	return { start, end };
};
