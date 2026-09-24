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
	const featurePrices = prices.filter(
		(price) => price.config.feature_id === featureId,
	);
	if (featurePrices.length === 0) {
		throw new RecaseError({
			message: `Feature ${featureId} has no price on this plan`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const price = featurePrices.find((candidate) =>
		matchesBehavior({ price: candidate, billingBehavior }),
	);
	if (!price) {
		throw new RecaseError({
			message: `Feature ${featureId} has no ${billingBehavior} price on this plan`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return price;
};
