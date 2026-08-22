import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import {
	type CurrencyAwarePriceConfig,
	priceConfigForCurrency,
} from "@models/productModels/priceModels/priceConfig/priceCurrencyView.js";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "@models/productModels/productModels.js";
import { productsAreSame } from "../../productV2Utils/compareProductUtils/compareProductUtils.js";
import { cusProductToProduct } from "../convertCusProduct.js";

/**
 * CURRENCY PROJECTION — collapses a price to the one currency this customer is
 * billed in, then drops the rest of the currency map.
 *
 * A plan's other currencies are a purchase-time option for new buyers; the
 * customer's own currency is locked at first paid attach. So adding GBP to a
 * plan must not make its existing USD customers look customized, while editing
 * the amount they are actually billed in must.
 *
 * Projecting here rather than teaching `productsAreSame` about currencies keeps
 * every catalog-diff caller of that function untouched: once both sides carry
 * no `currencies`, its `additional_currencies` check compares undefined to
 * undefined and passes on its own.
 *
 * The key that was present is always kept (`amount` for fixed prices,
 * `usage_tiers` for usage prices) so downstream mappers never meet a missing
 * field. A currency the plan does not price falls to null/[] and therefore
 * reads as a difference — the customer is on something the plan no longer
 * offers, which is genuinely custom.
 */
const projectPriceToCurrency = ({
	price,
	currency,
	orgDefaultCurrency,
}: {
	price: Price;
	currency: string;
	orgDefaultCurrency: string;
}): Price => {
	const config = price.config as CurrencyAwarePriceConfig | null | undefined;
	if (!config) return price;

	const projected = priceConfigForCurrency({
		config,
		currency,
		orgDefault: orgDefaultCurrency,
	});

	const nextConfig: CurrencyAwarePriceConfig = {
		...config,
		currencies: undefined,
		base_currency: undefined,
	};

	if ("amount" in config) nextConfig.amount = projected.amount ?? null;
	if (Array.isArray(config.usage_tiers)) {
		nextConfig.usage_tiers = projected.usage_tiers ?? [];
	}

	return { ...price, config: nextConfig } as Price;
};

const projectPrices = ({
	prices,
	currency,
	orgDefaultCurrency,
}: {
	prices: Price[];
	currency: string;
	orgDefaultCurrency: string;
}): Price[] =>
	(prices ?? []).map((price) =>
		projectPriceToCurrency({ price, currency, orgDefaultCurrency }),
	);

/**
 * Is this customer product a customized version of the plan it points at?
 *
 * Derived by comparing the customer's own price and entitlement rows against
 * the catalog version the row references — never taken from request input.
 *
 * Deliberately compares ITEMS ONLY:
 * - Free trial is excluded. A longer trial for one customer is not a custom
 *   plan, and trials are inherited (not re-read from catalog) across version
 *   changes, so those customers stay intact without the flag.
 * - Plan licenses are excluded. Known gap: a customer whose only divergence is
 *   seat-related reads as non-custom. Matches existing behaviour — the flag has
 *   never covered licenses — so this is a gap left open, not one introduced.
 * - Product details, config, metadata and billing controls are excluded because
 *   they are columns on the product row the customer product already points at,
 *   making the comparison tautological.
 * - Feature quantities (prepaid amounts) are excluded: buying more of something
 *   is usage, not customization.
 * - Currencies other than the customer's own are excluded, via the projection
 *   above.
 *
 * Biased towards `true`. A false positive only means the customer is skipped by
 * version migrations; a false negative lets a migration overwrite genuinely
 * customized prices and entitlements.
 */
export const deriveCustomerProductIsCustom = ({
	customerProduct,
	baseProduct,
	features,
	currency,
	orgDefaultCurrency,
}: {
	customerProduct: FullCusProduct;
	/** The catalog version `customerProduct.internal_product_id` points at,
	 * loaded with custom rows excluded. Nullish when it could not be resolved. */
	baseProduct?: FullProduct | null;
	features: Feature[];
	/** The currency this customer is billed in (locked at first paid attach,
	 * falling back to the org default). Both sides are projected into it. */
	currency: string;
	/** The org default, needed to tell a price's base currency from an override. */
	orgDefaultCurrency: string;
}): boolean => {
	// Cannot prove it matches the catalog, so assume it does not.
	if (!baseProduct) return true;

	try {
		const customerFullProduct = cusProductToProduct({
			cusProduct: customerProduct,
		});

		const { itemsSame } = productsAreSame({
			curProductV1: {
				...baseProduct,
				prices: projectPrices({
					prices: baseProduct.prices,
					currency,
					orgDefaultCurrency,
				}),
			},
			newProductV1: {
				...customerFullProduct,
				prices: projectPrices({
					prices: customerFullProduct.prices,
					currency,
					orgDefaultCurrency,
				}),
			},
			features,
		});

		return !itemsSame;
	} catch {
		return true;
	}
};
