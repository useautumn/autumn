import {
	type FullProduct,
	findPriceByFeatureId,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";

const getStripeAnchorPrice = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}) => {
	const price = findPriceByFeatureId({
		prices: product.prices,
		featureId,
	});

	return price?.config.stripe_product_id ? price : undefined;
};

export const inheritStripeProductFromCatalog = ({
	price,
	product,
	products,
}: {
	price: Price;
	product: FullProduct;
	products: FullProduct[];
}): Price => {
	const featureId = price.config.feature_id;
	if (!featureId || price.config.stripe_product_id) return price;

	const samePlanProducts = products
		.filter((candidate) => candidate.id === product.id)
		.sort((a, b) => a.version - b.version);
	const sourcePrice = samePlanProducts
		.map((candidate) => getStripeAnchorPrice({ product: candidate, featureId }))
		.find((candidate): candidate is Price => Boolean(candidate));

	if (!sourcePrice?.config.stripe_product_id) return price;

	const config = price.config as UsagePriceConfig;
	const sourceConfig = sourcePrice.config as UsagePriceConfig;

	return {
		...price,
		config: {
			...config,
			stripe_product_id: sourceConfig.stripe_product_id,
			stripe_meter_id: sourceConfig.stripe_meter_id ?? config.stripe_meter_id,
		},
	};
};
