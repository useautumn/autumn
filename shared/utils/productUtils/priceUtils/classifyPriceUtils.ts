import type { Feature } from "@models/featureModels/featureModels";
import { Infinite } from "@models/productModels/productEnums";
import { BillingInterval } from "../../../models/productModels/intervals/billingInterval";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type {
	UsagePriceConfig,
	UsageTier,
} from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig";
import { BillingType } from "../../../models/productModels/priceModels/priceEnums";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { getBillingType } from "../priceUtils";

export const isOneOffPrice = (
	price: Price,
): price is Price & {
	config: FixedPriceConfig & { interval: BillingInterval.OneOff };
} => {
	return price.config.interval === BillingInterval.OneOff;
};

export const isFixedPrice = (
	price: Price,
): price is Price & { config: FixedPriceConfig } => {
	const billingType = getBillingType(price.config);
	return (
		billingType === BillingType.FixedCycle || billingType === BillingType.OneOff
	);
};

export const isUsagePrice = ({
	price,
	featureId,
}: {
	price: Price;
	featureId?: string;
}) => {
	const billingType = getBillingType(price.config);

	const isUsage =
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated ||
		billingType === BillingType.UsageInAdvance;

	if (featureId) {
		return isUsage && price.config.feature_id === featureId;
	}

	return isUsage;
};

export const isPayPerUsePrice = ({ price }: { price: Price }) => {
	const billingType = getBillingType(price.config);
	return (
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated
	);
};

export const isConsumablePrice = (
	price: Price,
): price is Price & { config: UsagePriceConfig } => {
	if (!price) return false;
	const billingType = getBillingType(price.config);
	return billingType === BillingType.UsageInArrear;
};

export const isAllocatedPrice = (
	price: Price,
): price is Price & { config: UsagePriceConfig } => {
	if (!price) return false;
	const billingType = getBillingType(price.config);
	return billingType === BillingType.InArrearProrated;
};

export const isPrepaidPrice = (
	price: Price,
): price is Price & { config: UsagePriceConfig } => {
	const billingType = getBillingType(price.config);
	return billingType === BillingType.UsageInAdvance;
};

export const isFinalTier = (
	tier: UsageTier,
): tier is UsageTier & { to: typeof Infinite | -1 } => {
	return tier.to === -1 || tier.to === Infinite;
};

export const isNotFinalTier = (
	tier: UsageTier,
): tier is UsageTier & { to: number } => {
	return tier.to !== -1 && tier.to !== Infinite;
};

export const priceOnFeature = ({
	price,
	feature,
}: {
	price: Price;
	feature: Feature;
}) => {
	return (
		price.config.internal_feature_id === feature.internal_id ||
		price.config.feature_id === feature.id
	);
};
