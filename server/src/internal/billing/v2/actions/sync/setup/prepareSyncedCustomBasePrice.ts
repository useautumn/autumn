import {
	type FullCusProduct,
	type FullProduct,
	getAllPriceStripeIds,
	isFixedPrice,
	type Price,
	type SyncPlanInstance,
	setPriceCurrencyStripeId,
} from "@autumn/shared";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";

export const prepareSyncedCustomBasePrice = ({
	currentCustomerProduct,
	fullProduct,
	customPrices,
	plan,
}: {
	currentCustomerProduct?: FullCusProduct;
	fullProduct: FullProduct;
	customPrices: Price[];
	plan: SyncPlanInstance;
}) => {
	const source = plan.customize?.price;
	const generated = customPrices.find(isFixedPrice);
	if (!source?.base_currency || !source.stripe_price_id || !generated) return;

	const currency = source.base_currency.toLowerCase();
	generated.config.base_currency = currency;
	setPriceCurrencyStripeId({
		config: generated.config,
		currency,
		orgDefault: currency,
		slot: "stripe_price_id",
		id: source.stripe_price_id,
	});

	if (!currentCustomerProduct) return;
	const existing = customerProductToBasePrice({
		customerProduct: currentCustomerProduct,
	});
	if (
		!existing?.is_custom ||
		!getAllPriceStripeIds({ config: existing.config }).includes(
			source.stripe_price_id,
		)
	) {
		return;
	}

	const productIndex = fullProduct.prices.indexOf(generated);
	if (productIndex >= 0) fullProduct.prices[productIndex] = existing;
	customPrices.splice(customPrices.indexOf(generated), 1);
};
