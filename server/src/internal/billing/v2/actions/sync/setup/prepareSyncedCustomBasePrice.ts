import {
	type FullCusProduct,
	type FullProduct,
	getAllPriceStripeIds,
	isFixedPrice,
	type Price,
	type SyncPlanInstance,
} from "@autumn/shared";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";

const findReusableCustomBasePrice = ({
	currentCustomerProduct,
	baseCurrency,
	defaultCurrency,
	stripePriceId,
}: {
	currentCustomerProduct?: FullCusProduct;
	baseCurrency: string;
	defaultCurrency: string;
	stripePriceId: string;
}): Price | undefined => {
	const existingCustomBase = currentCustomerProduct
		? customerProductToBasePrice({ customerProduct: currentCustomerProduct })
		: undefined;
	const existingCurrency =
		existingCustomBase?.config.base_currency ?? defaultCurrency;
	const matchesSource =
		existingCustomBase?.is_custom &&
		existingCurrency.toLowerCase() === baseCurrency.toLowerCase() &&
		getAllPriceStripeIds({ config: existingCustomBase.config }).includes(
			stripePriceId,
		);
	return matchesSource ? existingCustomBase : undefined;
};

export const prepareSyncedCustomBasePrice = ({
	currentCustomerProduct,
	fullProduct,
	customPrices,
	plan,
	defaultCurrency,
}: {
	currentCustomerProduct?: FullCusProduct;
	fullProduct: FullProduct;
	customPrices: Price[];
	plan: SyncPlanInstance;
	/** Prices saved without a base currency bill in this one. */
	defaultCurrency: string;
}): { fullProduct: FullProduct; customPrices: Price[] } => {
	const customBaseParams = plan.customize?.price;
	const generatedCustomBase = customPrices.find(isFixedPrice);
	if (!customBaseParams?.stripe_price_id || !generatedCustomBase) {
		return { fullProduct, customPrices };
	}
	const baseCurrency = (
		customBaseParams.base_currency ?? defaultCurrency
	).toLowerCase();

	const importedCustomBase = {
		...generatedCustomBase,
		config: {
			...generatedCustomBase.config,
			base_currency: baseCurrency,
			stripe_price_id: customBaseParams.stripe_price_id,
		},
	};
	const reusableCustomBase = findReusableCustomBasePrice({
		currentCustomerProduct,
		baseCurrency,
		defaultCurrency,
		stripePriceId: customBaseParams.stripe_price_id,
	});
	const customBase = reusableCustomBase ?? importedCustomBase;

	return {
		fullProduct: {
			...fullProduct,
			prices: fullProduct.prices.map((price) =>
				price === generatedCustomBase ? customBase : price,
			),
		},
		customPrices: reusableCustomBase
			? customPrices.filter((price) => price !== generatedCustomBase)
			: customPrices.map((price) =>
					price === generatedCustomBase ? importedCustomBase : price,
				),
	};
};
