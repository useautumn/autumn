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

	if (quantity === 0 && isCheckout) {
		return {
			price: config.stripe_placeholder_price_id,
		};
	} else {
		return {
			price: config.stripe_price_id,
			quantity,
		};
	}
};
