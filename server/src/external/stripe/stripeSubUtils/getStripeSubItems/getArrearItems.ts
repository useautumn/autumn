import {
	type BillingInterval,
	BillingType,
	intervalsDifferent,
	type Organization,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
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
	const placeholderItems: any[] = [];
	for (const price of prices) {
		const billingType = getBillingType(price.config!);
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

		if (billingType === BillingType.UsageInArrear) {
			const config = price.config! as UsagePriceConfig;
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
