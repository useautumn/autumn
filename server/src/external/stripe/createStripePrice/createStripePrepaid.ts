import {
	BillingInterval,
	type EntitlementWithFeature,
	type Organization,
	type Price,
	type Product,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	getBillingType,
	getPriceEntitlement,
} from "@/internal/products/prices/priceUtils.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";

export const prepaidToStripeTiers = (
	price: Price,
	_entitlement: EntitlementWithFeature,
) => {
	const usageConfig = structuredClone(price.config) as UsagePriceConfig;

	const billingUnits = usageConfig.billing_units;
	// const numFree = entitlement.allowance
	//   ? Math.round(entitlement.allowance! / billingUnits!)
	//   : 0;

	const tiers: any[] = [];

	for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
		const tier = usageConfig.usage_tiers[i];
		const amount = new Decimal(tier.amount).mul(100).toNumber();
		const upTo =
			tier.to === -1 || tier.to === TierInfinite
				? "inf"
				: Math.round(tier.to / billingUnits!);

		tiers.push({
			unit_amount_decimal: amount,
			up_to: upTo,
		});
	}

	return tiers;
};

export const createStripePrepaid = async ({
	db,
	price,
	product,
	org,
	entitlements,
	curStripeProd,
	stripeCli,
}: {
	db: DrizzleCli;
	price: Price;
	product: Product;
	org: Organization;
	entitlements: EntitlementWithFeature[];
	curStripeProd: Stripe.Product | null;
	stripeCli: Stripe;
}) => {
	const relatedEnt = getPriceEntitlement(price, entitlements);

	let recurringData;
	if (price.config?.interval !== BillingInterval.OneOff) {
		recurringData = billingIntervalToStripe({
			interval: price.config?.interval,
			intervalCount: price.config?.interval_count,
		});
	}

	const config = price.config as UsagePriceConfig;

	// 1. Product name
	const productName = `${product.name} - ${
		config.billing_units === 1 ? "" : `${config.billing_units} `
	}${relatedEnt.feature.name}`;

	const productData = curStripeProd
		? { product: curStripeProd.id }
		: {
				product_data: {
					name: productName,
				},
			};

	// 2. If billing interval is one off
	let stripePrice = null;
	if (price.config?.interval === BillingInterval.OneOff) {
		const amount = config.usage_tiers[0].amount;

		const unitAmountDecimalStr = new Decimal(amount)
			.mul(100)
			.toDecimalPlaces(10)
			.toString();

		stripePrice = await stripeCli.prices.create({
			...productData,
			unit_amount_decimal: unitAmountDecimalStr,
			currency: org.default_currency!,
		});

		config.stripe_product_id = stripePrice.product as string;
		config.stripe_price_id = stripePrice.id;
	} else {
		const tiers = prepaidToStripeTiers(price, relatedEnt);

		let priceAmountData = {};
		if (tiers.length === 1) {
			priceAmountData = {
				unit_amount_decimal: tiers[0].unit_amount_decimal,
			};
		} else {
			priceAmountData = {
				billing_scheme: "tiered",
				tiers_mode: "graduated",
				tiers: tiers,
			};
		}

		stripePrice = await stripeCli.prices.create({
			...productData,
			currency: org.default_currency!,
			...priceAmountData,
			recurring: {
				...(recurringData as any),
			},
			nickname: `Autumn Price (${relatedEnt.feature.name})`,
		});

		config.stripe_price_id = stripePrice.id;
		config.stripe_product_id = stripePrice.product as string;
		const _billingType = getBillingType(price.config!);
	}

	// New config
	price.config = config;
	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
