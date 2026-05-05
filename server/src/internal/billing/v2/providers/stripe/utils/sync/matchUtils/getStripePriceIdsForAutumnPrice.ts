import type {
	FixedPriceConfig,
	Price,
	UsagePriceConfig,
} from "@autumn/shared";

const getPriceConfig = ({
	price,
}: {
	price: Price;
}): FixedPriceConfig | UsagePriceConfig => {
	return price.config as FixedPriceConfig | UsagePriceConfig;
};

export const getStripePriceIdsForAutumnPrice = ({
	price,
}: {
	price: Price;
}): string[] => {
	const config = getPriceConfig({ price });

	return [
		config.stripe_price_id,
		config.stripe_empty_price_id,
		"stripe_prepaid_price_v2_id" in config
			? config.stripe_prepaid_price_v2_id
			: null,
	].filter(Boolean) as string[];
};
