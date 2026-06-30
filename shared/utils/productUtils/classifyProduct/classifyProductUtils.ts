import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { ProductCatalogType } from "../../../models/productModels/productEnums.js";
import type { FullProduct } from "../../../models/productModels/productModels.js";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import type { UsagePriceConfig } from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import { PriceType } from "../../../models/productModels/priceModels/priceEnums.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import { notNullish, nullish } from "../../utils.js";

// TODO: Write unit tests for these functions (?)

export const isOneOffProduct = ({ prices }: { prices: Price[] }) => {
	return (
		prices.every((p) => p.config?.interval === BillingInterval.OneOff) &&
		prices.some((p) => {
			if (p.config?.type === PriceType.Usage) {
				const config = p.config as UsagePriceConfig;
				return config.usage_tiers.some((t) => t.amount > 0);
			} else {
				const config = p.config as FixedPriceConfig;
				return config.amount > 0;
			}
		})
	);
};

export const isFreeProduct = ({ prices }: { prices: Price[] }) => {
	if (prices.length === 0) {
		return true;
	}

	let totalPrice = 0;
	for (const price of prices) {
		if ("usage_tiers" in price.config && notNullish(price.config.usage_tiers)) {
			const tiers = price.config.usage_tiers;
			if (nullish(tiers) || tiers.length === 0) continue;
			totalPrice += tiers.reduce(
				(acc, tier) => acc + tier.amount + (tier.flat_amount ?? 0),
				0,
			);
		} else if ("amount" in price.config && notNullish(price.config.amount)) {
			totalPrice += price.config.amount ?? 0;
		}
	}
	return totalPrice === 0;
};

export const isOneOffOrAddOnProduct = ({
	product,
}: {
	product: FullProduct;
}) => {
	return isOneOffProduct({ prices: product.prices }) || product.is_add_on;
};

type CatalogTypedProduct = {
	catalog_type?: ProductCatalogType | null;
};

export const isLicenseProduct = ({
	product,
}: {
	product: CatalogTypedProduct;
}) => {
	return product.catalog_type === ProductCatalogType.License;
};

export const isCatalogPlanProduct = ({
	product,
}: {
	product: CatalogTypedProduct;
}) => {
	return !isLicenseProduct({ product });
};

export const isLicenseCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: { product: CatalogTypedProduct };
}) => {
	return isLicenseProduct({ product: customerProduct.product });
};
