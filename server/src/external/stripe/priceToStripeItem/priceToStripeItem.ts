import {
	ApiVersion,
	BillingType,
	type EntitlementWithFeature,
	ErrCode,
	type FeatureOptions,
	type FixedPriceConfig,
	type FullProduct,
	InternalError,
	type Organization,
	type Price,
	type ProductOptions,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	getBillingType,
	priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import { priceToInArrearProrated } from "./priceToArrearProrated.js";
import {
	priceToOneOffAndTiered,
	priceToUsageInAdvance,
} from "./priceToUsageInAdvance.js";

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
	productOptions,
}: {
	price: Price;
	relatedEnt: EntitlementWithFeature;
	product: FullProduct;
	org: Organization;
	options: FeatureOptions | undefined | null;
	existingUsage: number;
	withEntity: boolean;
	isCheckout: boolean;
	apiVersion?: ApiVersion;
	productOptions?: ProductOptions | undefined;
}) => {
	// TODO: Implement this
	const billingType = getBillingType(price.config!);
	const stripeProductId = product.processor?.id;

	const quantityMultiplier = notNullish(productOptions?.quantity)
		? productOptions?.quantity!
		: 1;

	if (!stripeProductId) {
		throw new InternalError({
			message: `product ${product.id} has no stripe product id`,
		});
	}

	const lineItemMeta = null;
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
	}

	// 2. PREPAID, TIERED, ONE OFF
	else if (
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
			relatedEnt,
		});
	}

	// 4. USAGE IN ARREAR
	else if (billingType === BillingType.UsageInArrear) {
		const config = price.config as UsagePriceConfig;
		const priceId = config.stripe_price_id;

		if (withEntity && !isCheckout) {
			return {
				lineItem: {
					price: config.stripe_empty_price_id,
					quantity: 0,
				},
			};
		}

		if (apiVersion === ApiVersion.Beta && !isCheckout) {
			return {
				lineItem: {
					// lineItem: getEmptyPriceItem({ price, org }),
					price: config.stripe_empty_price_id,
					quantity: 0,
				},
			};
		}

		if (!priceId) {
			throw new RecaseError({
				code: ErrCode.PriceNotFound,
				message: `Couldn't find Autumn price: ${price.id} in Stripe`,
				statusCode: 400,
			});
		}

		lineItem = {
			price: priceId,
		};
	}

	// 5. USAGE ARREAR PRORATED
	else if (billingType === BillingType.InArrearProrated) {
		lineItem = priceToInArrearProrated({
			price,
			isCheckout,
			existingUsage,
		});
	}

	if (!lineItem) {
		return null;
	}

	return {
		lineItem,
		lineItemMeta,
	};
};
