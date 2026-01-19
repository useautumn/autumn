import {
	BillingInterval,
	BillingType,
	type FullProduct,
	isFixedPrice,
	type Price,
	type ProductOptions,
	UsageModel,
} from "@autumn/shared";
import { getBillingType } from "../priceUtils.js";

export const priceToIntervalKey = (price: Price) => {
	return toIntervalKey({
		interval: price.config?.interval,
		intervalCount: price.config?.interval_count ?? 1,
	});
};

export const toIntervalKey = ({
	interval,
	intervalCount,
}: {
	interval: BillingInterval;
	intervalCount: number;
}) => {
	if (interval === BillingInterval.OneOff) {
		return BillingInterval.OneOff;
	} else if (interval === BillingInterval.Quarter) {
		const finalCount = (intervalCount ?? 1) * 3;
		return `${BillingInterval.Month}-${finalCount}`;
	} else if (interval === BillingInterval.SemiAnnual) {
		const finalCount = (intervalCount ?? 1) * 6;
		return `${BillingInterval.Month}-${finalCount}`;
	}

	if (interval === BillingInterval.Week) {
		return `${BillingInterval.Week}-${intervalCount}`;
	} else if (interval === BillingInterval.Year) {
		return `${BillingInterval.Year}-${intervalCount}`;
	}
	return `${interval}-${intervalCount}`;
};

export const intervalKeyToPrice = (intervalKey: string) => {
	const [interval, intervalCount] = intervalKey.split("-");
	return {
		interval: interval as BillingInterval,
		intervalCount: intervalCount ? parseInt(intervalCount) : 1,
	};
};

export const priceToUsageModel = (price: Price) => {
	const billingType = getBillingType(price.config);
	if (isFixedPrice(price)) {
		return undefined;
	}
	if (billingType === BillingType.UsageInAdvance) {
		return UsageModel.Prepaid;
	}
	return UsageModel.PayPerUse;
};

export const priceToProductOptions = ({
	price,
	options,
	products,
}: {
	price: Price;
	options: ProductOptions[] | undefined;
	products: FullProduct[];
}) => {
	if (!options) return undefined;

	const productId = products.find(
		(p) => p.internal_id === price.internal_product_id,
	)?.id;

	const productOptions = options.find((o) => o.product_id === productId);
	return productOptions;
};
