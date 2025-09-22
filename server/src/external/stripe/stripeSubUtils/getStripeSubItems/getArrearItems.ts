import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import {
	BillingInterval,
	BillingType,
	intervalsDifferent,
	Organization,
	UsagePriceConfig,
} from "@autumn/shared";

import { Price } from "@autumn/shared";
import { billingIntervalToStripe } from "../../stripePriceUtils.js";

export const getArrearItems = ({
	prices,
	org,
	interval,
	intervalCount,
}: {
	prices: Price[];
	interval: BillingInterval;
	intervalCount: number;
	org: Organization;
}) => {
	let placeholderItems: any[] = [];
	for (const price of prices) {
		let billingType = getBillingType(price.config!);
		if (
			intervalsDifferent({
				intervalA: {
					interval: price.config!.interval!,
					intervalCount: price.config!.interval_count!,
				},
				intervalB: { interval, intervalCount },
			})
		) {
			continue;
		}

		if (billingType == BillingType.UsageInArrear) {
			let config = price.config! as UsagePriceConfig;
			placeholderItems.push({
				price_data: {
					product: config.stripe_product_id!,
					unit_amount: 1,
					currency: org.default_currency || "usd",
					recurring: {
						...billingIntervalToStripe({
							interval,
							intervalCount,
						}),
					},
				},
				quantity: 0,
			});
		}
	}

	return placeholderItems;
};
