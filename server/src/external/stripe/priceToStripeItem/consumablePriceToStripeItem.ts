import {
	ApiVersion,
	InternalError,
	isConsumablePrice,
	type Price,
} from "@autumn/shared";

export const consumablePriceToStripeItem = ({
	price,
	isCheckout,
	withEntity,
	apiVersion,
	fromVercel,
}: {
	price: Price;
	isCheckout: boolean;
	withEntity: boolean;
	apiVersion?: ApiVersion;
	fromVercel: boolean;
}) => {
	if (!isConsumablePrice(price)) {
		throw new InternalError({
			message: `[consumablePriceToStripeItem] Price ${price.id} is not a consumable price`,
		});
	}

	const config = price.config;
	const priceId = config.stripe_price_id ?? config.stripe_empty_price_id;

	const newUsageMethod =
		withEntity || apiVersion === ApiVersion.V1_Beta || fromVercel;

	if (newUsageMethod && !isCheckout) {
		return {
			price: config.stripe_empty_price_id,
			quantity: 0,
		};
	}

	if (!priceId) {
		// Create custom price...?

		throw new InternalError({
			message: `[consumablePriceToStripeItem] config.stripe_price_id is empty for autumn price: ${price.id}`,
		});
	}

	return {
		price: priceId,
	};
};
