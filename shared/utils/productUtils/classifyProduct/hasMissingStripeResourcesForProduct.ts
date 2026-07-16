import { BillingType } from "@models/productModels/priceModels/priceEnums.js";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "@models/productModels/productModels.js";
import { isPreviewStripeId } from "@utils/stripeUtils/classifyStripeResource/isPreviewStripeId.js";
import { notNullish } from "@utils/utils.js";
import { priceIsTieredOneOff } from "../priceUtils/classifyPrice/priceIsTieredOneOff.js";
import { isFixedPrice } from "../priceUtils/classifyPriceUtils.js";
import { getBillingType } from "../priceUtils.js";
import { isFreeProduct } from "./classifyProductUtils.js";

type StripeResourceConfig = Partial<
	Record<
		| "stripe_price_id"
		| "stripe_product_id"
		| "stripe_prepaid_price_v2_id"
		| "stripe_meter_id"
		| "stripe_placeholder_price_id",
		string | null
	>
>;

const hasUsableStripeId = (stripeId?: string | null) =>
	notNullish(stripeId) && !isPreviewStripeId({ stripeId });

const shouldInitializeStripePrice = ({ price }: { price: Price }) => {
	if (!isFixedPrice(price)) return true;

	return (price.config.amount ?? 0) > 0;
};

export const priceHasMissingStripeResources = ({
	price,
	product,
}: {
	price: Price;
	product: FullProduct;
}) => {
	if (!shouldInitializeStripePrice({ price })) return false;

	const config = price.config as StripeResourceConfig;
	const billingType = getBillingType(price.config);

	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		return !hasUsableStripeId(config.stripe_price_id);
	}

	if (billingType === BillingType.UsageInAdvance) {
		if (priceIsTieredOneOff({ price, product })) {
			return !hasUsableStripeId(config.stripe_product_id);
		}

		return (
			!hasUsableStripeId(config.stripe_price_id) ||
			!hasUsableStripeId(config.stripe_product_id) ||
			!hasUsableStripeId(config.stripe_prepaid_price_v2_id)
		);
	}

	if (billingType === BillingType.InArrearProrated) {
		return (
			!hasUsableStripeId(config.stripe_price_id) ||
			!hasUsableStripeId(config.stripe_product_id) ||
			!hasUsableStripeId(config.stripe_meter_id) ||
			!hasUsableStripeId(config.stripe_placeholder_price_id)
		);
	}

	return (
		!hasUsableStripeId(config.stripe_price_id) ||
		!hasUsableStripeId(config.stripe_product_id) ||
		!hasUsableStripeId(config.stripe_meter_id)
	);
};

export const hasMissingStripeResourcesForProduct = ({
	product,
}: {
	product: FullProduct;
}) => {
	const resourceProducts = [
		product,
		...(product.licenses ?? []).map((license) => license.product),
	];

	return resourceProducts.some(
		(resourceProduct) =>
			(!isFreeProduct({ prices: resourceProduct.prices }) &&
				!hasUsableStripeId(resourceProduct.processor?.id)) ||
			resourceProduct.prices.some((price) =>
				priceHasMissingStripeResources({
					price,
					product: resourceProduct,
				}),
			),
	);
};
