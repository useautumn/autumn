import {
	BillingMethod,
	ErrCode,
	isConsumablePrice,
	isPrepaidPrice,
	type Price,
	RecaseError,
} from "@autumn/shared";

const matchesBehavior = ({
	price,
	billingBehavior,
}: {
	price: Price;
	billingBehavior: BillingMethod;
}) =>
	billingBehavior === BillingMethod.Prepaid
		? isPrepaidPrice(price)
		: isConsumablePrice(price);

const featurePricesOf = ({
	prices,
	featureId,
}: {
	prices: Price[];
	featureId: string;
}) => prices.filter((price) => price.config.feature_id === featureId);

/** The plan price that bills `featureId` with the requested behavior, if any. */
export const findOptionalInvoiceFeaturePrice = ({
	prices,
	featureId,
	billingBehavior,
}: {
	prices: Price[];
	featureId: string;
	billingBehavior: BillingMethod;
}): Price | undefined =>
	featurePricesOf({ prices, featureId }).find((price) =>
		matchesBehavior({ price, billingBehavior }),
	);

/** The plan price that bills `featureId` with the requested behavior. */
export const findInvoiceFeaturePrice = ({
	prices,
	featureId,
	billingBehavior,
}: {
	prices: Price[];
	featureId: string;
	billingBehavior: BillingMethod;
}): Price => {
	const price = findOptionalInvoiceFeaturePrice({
		prices,
		featureId,
		billingBehavior,
	});
	if (price) return price;
	throw new RecaseError({
		message:
			featurePricesOf({ prices, featureId }).length === 0
				? `Feature ${featureId} has no price on this plan`
				: `Feature ${featureId} has no ${billingBehavior} price on this plan`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
