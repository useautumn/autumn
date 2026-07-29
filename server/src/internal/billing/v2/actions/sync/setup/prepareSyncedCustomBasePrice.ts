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
	stripePriceId,
}: {
	currentCustomerProduct?: FullCusProduct;
	baseCurrency: string;
	stripePriceId: string;
}): Price | undefined => {
	const existingCustomBase = currentCustomerProduct
		? customerProductToBasePrice({ customerProduct: currentCustomerProduct })
		: undefined;
	const matchesSource =
		existingCustomBase?.is_custom &&
		existingCustomBase.config.base_currency?.toLowerCase() ===
			baseCurrency.toLowerCase() &&
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
}: {
	currentCustomerProduct?: FullCusProduct;
	fullProduct: FullProduct;
	customPrices: Price[];
	plan: SyncPlanInstance;
}): { fullProduct: FullProduct; customPrices: Price[] } => {
	const customBaseParams = plan.customize?.price;
	const generatedCustomBase = customPrices.find(isFixedPrice);
	if (
		!customBaseParams?.base_currency ||
		!customBaseParams.stripe_price_id ||
		!generatedCustomBase
	) {
		return { fullProduct, customPrices };
	}

	const importedCustomBase = {
		...generatedCustomBase,
		config: {
			...generatedCustomBase.config,
			base_currency: customBaseParams.base_currency.toLowerCase(),
			stripe_price_id: customBaseParams.stripe_price_id,
		},
	};
	const reusableCustomBase = findReusableCustomBasePrice({
		currentCustomerProduct,
		baseCurrency: customBaseParams.base_currency,
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
