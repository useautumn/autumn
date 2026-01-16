import {
	type ApiVersion,
	BillingType,
	type EntitlementWithFeature,
	type FeatureOptions,
	type FixedPriceConfig,
	type FullProduct,
	InternalError,
	type Organization,
	type Price,
} from "@autumn/shared";
import {
	getBillingType,
	priceIsOneOffAndTiered,
} from "@server/internal/products/prices/priceUtils";
import { billingIntervalToStripe } from "../stripePriceUtils";
import { consumablePriceToStripeItem } from "./consumablePriceToStripeItem";
import { priceToInArrearProrated } from "./priceToArrearProrated";
import {
	priceToOneOffAndTiered,
	priceToUsageInAdvance,
} from "./priceToUsageInAdvance";

export const getEmptyPriceItem = ({
	price,
	org,
}: {
	price: Price;
	org: Organization;
}) => {
	return {
		price_data: {
			product: price.config!.stripe_product_id!,
			unit_amount: 0,
			currency: org.default_currency || "usd",
			recurring: {
				...billingIntervalToStripe({
					interval: price.config!.interval!,
					intervalCount: price.config!.interval_count!,
				}),
			},
		},
		quantity: 1,
	};
};

// GET STRIPE LINE / SUB ITEM
export const priceToStripeItem = ({
	price,
	relatedEnt,
	product,
	org,
	options,
	existingUsage,
	withEntity = false,
	isCheckout = false,
	apiVersion,
	// productOptions,
	fromVercel = false,
}: {
	price: Price;
	relatedEnt?: EntitlementWithFeature;
	product: FullProduct;
	org: Organization;
	options: FeatureOptions | undefined | null;
	existingUsage?: number;
	withEntity: boolean;
	isCheckout: boolean;
	apiVersion?: ApiVersion;
	// productOptions?: ProductOptions | undefined;
	fromVercel?: boolean;
}) => {
	// TODO: Implement this
	const billingType = getBillingType(price.config!);
	const stripeProductId = product.processor?.id;

	// const quantityMultiplier = notNullish(productOptions?.quantity)
	// 	? productOptions?.quantity
	// 	: 1;

	const quantityMultiplier = 1;

	if (!stripeProductId) {
		throw new InternalError({
			message: `product ${product.id} has no stripe product id`,
		});
	}

	let lineItem = null;

	// 1. FIXED PRICE
	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		const config = price.config as FixedPriceConfig;

		lineItem = {
			price: config.stripe_price_id,
			quantity: quantityMultiplier,
		};

		return { lineItem };
	}

	if (!relatedEnt) {
		return null;
	}

	// 2. PREPAID, TIERED, ONE OFF
	if (
		billingType === BillingType.UsageInAdvance &&
		priceIsOneOffAndTiered(price, relatedEnt)
	) {
		lineItem = priceToOneOffAndTiered({
			price,
			options,
			relatedEnt,
			org,
			stripeProductId,
		});
	}

	// 3. PREPAID
	else if (billingType === BillingType.UsageInAdvance) {
		lineItem = priceToUsageInAdvance({
			price,
			options,
			isCheckout,
		});
	}

	// 4. USAGE IN ARREAR
	else if (billingType === BillingType.UsageInArrear) {
		lineItem = consumablePriceToStripeItem({
			price,
			isCheckout,
			withEntity,
			apiVersion,
			fromVercel,
		});
	}

	// 5. USAGE ARREAR PRORATED
	else if (billingType === BillingType.InArrearProrated) {
		lineItem = priceToInArrearProrated({
			price,
			isCheckout,
			existingUsage: existingUsage ?? 0,
		});
	}

	if (!lineItem) {
		return null;
	}

	return {
		lineItem,
	};
};
