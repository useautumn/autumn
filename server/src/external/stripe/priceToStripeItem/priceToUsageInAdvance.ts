import type {
	EntitlementWithFeature,
	FeatureOptions,
	Organization,
	Price,
	UsagePriceConfig,
} from "@autumn/shared";
import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

export const priceToOneOffAndTiered = ({
	price,
	relatedEnt,
	options,
	stripeProductId,
	org,
}: {
	price: Price;
	relatedEnt: EntitlementWithFeature;
	options: FeatureOptions | undefined | null;
	org: Organization;
	stripeProductId: string;
}) => {
	const config = price.config as UsagePriceConfig;
	const quantity = options?.quantity!;
	const overage = quantity * config.billing_units! - relatedEnt.allowance!;

	if (overage <= 0) {
		return null;
	}

	const amount = getPriceForOverage(price, overage);
	if (!config.stripe_product_id) {
		console.log(
			`WARNING: One off & tiered in advance price has no stripe product id: ${price.id}, ${relatedEnt.feature.name}`,
		);
	}
	return {
		price_data: {
			product: config.stripe_product_id
				? config.stripe_product_id
				: stripeProductId,
			unit_amount: Number(amount.toFixed(2)) * 100,
			currency: org.default_currency,
		},

		quantity: 1,
	};
};

export const priceToUsageInAdvance = ({
	price,
	relatedEnt,
	options,
	isCheckout,
}: {
	price: Price;
	relatedEnt: EntitlementWithFeature;
	options: FeatureOptions | undefined | null;
	isCheckout: boolean;
}) => {
	const config = price.config as UsagePriceConfig;
	const optionsQuantity = options?.quantity;
	let finalQuantity = optionsQuantity;

	// 1. If adjustable quantity is set, use that, else if quantity is undefined, adjustable is true, else false
	const adjustable = notNullish(options?.adjustable_quantity)
		? options?.adjustable_quantity
		: !!nullish(optionsQuantity);

	if (optionsQuantity === 0 && isCheckout) {
		// 1. If quantity is 0 and is checkout, skip over line item
		return null;
	} else if (nullish(optionsQuantity) && isCheckout) {
		// 2. If quantity is nullish and is checkout, default to 1
		finalQuantity = 1;
	}

	// Divide final quantity by billing units...?

	// let minimum = new Decimal(relatedEnt.allowance!)
	//   .div(config.billing_units || 1)
	//   .toNumber();

	const adjustableQuantity =
		isCheckout && adjustable
			? {
					enabled: true,
					maximum: 999999,
				}
			: undefined;

	return {
		price: config.stripe_price_id,
		quantity: finalQuantity,
		adjustable_quantity: adjustableQuantity,
	};
};
