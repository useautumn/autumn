import {
	BillingVersion,
	LATEST_BILLING_VERSION,
} from "@models/billingModels/context/billingContext";
import type { Price } from "@models/productModels/priceModels/priceModels.js";
import type { FullProduct } from "@models/productModels/productModels.js";
import { priceIsTieredOneOff } from "@utils/productUtils/priceUtils/classifyPrice/priceIsTieredOneOff.js";
import {
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils.js";

export type RequiredStripeResourceSlot =
	| "stripe_price_id"
	| "stripe_empty_price_id"
	| "stripe_placeholder_price_id"
	| "stripe_prepaid_price_v2_id"
	| "stripe_product_id"
	| "stripe_meter_id";

export const priceToRequiredStripeSlots = ({
	price,
	product,
	billingVersion = LATEST_BILLING_VERSION,
}: {
	price: Price;
	product: FullProduct;
	billingVersion?: BillingVersion;
}): RequiredStripeResourceSlot[] => {
	if (isFixedPrice(price)) {
		if ((price.config.amount ?? 0) <= 0) return [];
		return ["stripe_price_id"];
	}

	if (isPrepaidPrice(price)) {
		if (priceIsTieredOneOff({ price, product })) {
			return ["stripe_product_id"];
		}
		if (billingVersion === BillingVersion.V1) {
			return ["stripe_price_id", "stripe_product_id"];
		}
		return ["stripe_prepaid_price_v2_id", "stripe_product_id"];
	}

	if (isAllocatedPrice(price)) {
		if (billingVersion === BillingVersion.V1) {
			return [
				"stripe_price_id",
				"stripe_product_id",
				"stripe_meter_id",
				"stripe_placeholder_price_id",
			];
		}
		return ["stripe_price_id", "stripe_product_id"];
	}

	if (isConsumablePrice(price)) {
		return ["stripe_price_id", "stripe_product_id", "stripe_meter_id"];
	}

	return [];
};
