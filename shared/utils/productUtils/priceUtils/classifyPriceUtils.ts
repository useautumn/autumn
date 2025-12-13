import { BillingType } from "../../../models/productModels/priceModels/priceEnums";
import type { Price } from "../../../models/productModels/priceModels/priceModels";
import { getBillingType } from "../priceUtils";

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
