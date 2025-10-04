import {
	BillingInterval,
	BillingType,
	type FullCusProduct,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { notNullish } from "@/utils/genUtils.js";
import { getBillingType } from "../../priceUtils.js";

export const isOneOffPrice = ({ price }: { price: Price }) => {
	return price.config.interval === BillingInterval.OneOff;
};

export const isArrearPrice = ({ price }: { price?: Price }) => {
	if (!price) return false;
	const billingType = getBillingType(price.config);
	return billingType === BillingType.UsageInArrear;
};
export const isContUsePrice = ({ price }: { price?: Price }) => {
	if (!price) return false;
	const billingType = getBillingType(price.config);
	return billingType === BillingType.InArrearProrated;
};

export const isPrepaidPrice = ({ price }: { price: Price }) => {
	const billingType = getBillingType(price.config);
	return billingType === BillingType.UsageInAdvance;
};

export const isPayPerUse = ({ price }: { price: Price }) => {
	const billingType = getBillingType(price.config);
	return (
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated
	);
};

export const isFixedPrice = ({ price }: { price: Price }) => {
	const billingType = getBillingType(price.config);

	return (
		billingType === BillingType.FixedCycle || billingType === BillingType.OneOff
	);
};

export const hasPrepaidPrice = ({
	prices,
	excludeOneOff,
}: {
	prices: Price[];
	excludeOneOff?: boolean;
}) => {
	return prices.some((price) => {
		const isUsage = getBillingType(price.config) === BillingType.UsageInAdvance;
		const isOneOff = price.config.interval === BillingInterval.OneOff;

		return isUsage && (excludeOneOff ? !isOneOff : true);
	});
};

export const isV4Usage = ({
	price,
	cusProduct,
}: {
	price: Price;
	cusProduct: FullCusProduct;
}) => {
	const billingType = getBillingType(price.config);

	return (
		billingType === BillingType.UsageInArrear &&
		(cusProduct.api_version === LegacyVersion.v1_4 ||
			notNullish(cusProduct.internal_entity_id))
	);
};

// export const
export const onIncreaseToStripeProration = ({
	onIncrease,
}: {
	onIncrease: OnIncrease;
}) => {
	let behavior = "none";
	if (onIncrease === OnIncrease.ProrateImmediately) {
		behavior = "always_invoice";
	} else if (onIncrease === OnIncrease.ProrateNextCycle) {
		behavior = "create_prorations";
	}

	return behavior as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;
};

export const onDecreaseToStripeProration = ({
	onDecrease,
}: {
	onDecrease: OnDecrease;
}) => {
	let behavior = "none";
	if (onDecrease === OnDecrease.ProrateImmediately) {
		behavior = "always_invoice";
	} else if (onDecrease === OnDecrease.ProrateNextCycle) {
		behavior = "create_prorations";
	}

	return behavior as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;
};

export const roundUsage = ({
	usage,
	price,
	pos = true,
}: {
	usage: number;
	price: Price;
	pos?: boolean;
}) => {
	const config = price.config as UsagePriceConfig;
	const billingUnits = config.billing_units || 1;

	const rounded = new Decimal(usage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();

	if (pos) {
		return Math.max(rounded, 0);
	}

	return rounded;
};
