import { BillingInterval } from "../../../models/productModels/intervals/billingInterval";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
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

export const isConsumablePayPerUsePrice = ({ price }: { price?: Price }) => {
	if (!price) return false;
	const billingType = getBillingType(price.config);
	return billingType === BillingType.UsageInArrear;
};
