import type { Price, UsagePriceConfig } from "@autumn/shared";

export const priceToInArrearProrated = ({
	price,
	isCheckout,
	existingUsage,
}: {
	price: Price;
	isCheckout: boolean;
	existingUsage: number;
}) => {
	const config = price.config as UsagePriceConfig;
	const quantity = existingUsage || 0;

	let adjustedQuantity = quantity;
	if (quantity > 0) {
		// If the quantity is a decimal, round up to the nearest integer for Stripe
		if (!Number.isInteger(quantity)) {
			adjustedQuantity = Math.ceil(quantity);
		}
	}

	if (quantity === 0 && isCheckout) {
		return {
			price: config.stripe_placeholder_price_id,
		};
	} else {
		return {
			price: config.stripe_price_id,
			quantity: adjustedQuantity,
		};
	}
};
