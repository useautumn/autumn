import {
	atmnToStripeAmountDecimal,
	BillingInterval,
	type EntitlementWithFeature,
	InternalError,
	type Organization,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "../../../db/initDrizzle.js";
import { orgToCurrency } from "../../../internal/orgs/orgUtils.js";
import { PriceService } from "../../../internal/products/prices/PriceService.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";

// 1. Product name
const prepaidToStripeTiers = ({
	ent,
	price,
	org,
}: {
	ent: EntitlementWithFeature;
	price: Price;
	org: Organization;
}) => {
	const usageTiers = price.config.usage_tiers;
	if (!usageTiers) {
		throw new InternalError({
			message:
				"[Internal Error] Converting prepaid price to tiers, but `usage_tiers` field is missing",
		});
	}
	// Create paid tiers first
	const paidTiers: Stripe.PriceCreateParams.Tier[] = usageTiers.map(
		(tier, index) => {
			const atmnUnitAmount = new Decimal(tier.amount).div(
				price.config.billing_units ?? 1,
			);

			const stripeUnitAmountDecimal = atmnToStripeAmountDecimal({
				amount: atmnUnitAmount,
				currency: orgToCurrency({ org }),
			});

			return {
				unit_amount_decimal: stripeUnitAmountDecimal,
				up_to: index === usageTiers.length - 1 ? "inf" : (tier.to ?? 0),
			};
		},
	);

	// 1. Get included usage
	const includedUsage = ent.allowance;

	if (includedUsage && includedUsage > 0) {
		paidTiers.forEach((tier) => {
			if (tier.up_to === "inf") {
				return;
			}
			tier.up_to = new Decimal(tier.up_to as number)
				.plus(includedUsage)
				.toNumber();
		});

		paidTiers.unshift({
			unit_amount_decimal: "0",
			up_to: includedUsage,
		});
	}

	return paidTiers;
};

export const createStripePrepaidPriceV2 = async ({
	org,
	stripeCli,
	db,
	price,
	ent,
	product,
	curStripeProd,
}: {
	org: Organization;
	stripeCli: Stripe;
	db: DrizzleCli;
	price: Price;
	ent: EntitlementWithFeature;
	product: Product;
	curStripeProd: Stripe.Product | null;
}) => {
	let recurringData;
	if (price.config!.interval !== BillingInterval.OneOff) {
		recurringData = billingIntervalToStripe({
			interval: price.config!.interval,
			intervalCount: price.config!.interval_count,
		});
	}

	const config = price.config as UsagePriceConfig;
	const productName = `${product.name} - ${ent.feature.name}`;

	const productData = curStripeProd
		? { product: curStripeProd.id }
		: {
				product_data: {
					name: productName,
				},
			};

	// 2. If billing interval is one off
	let stripePrice = null;
	if (price.config!.interval === BillingInterval.OneOff) {
		const amount = config.usage_tiers[0].amount;

		const unitAmountDecimalStr = atmnToStripeAmountDecimal({
			amount,
			currency: orgToCurrency({ org }),
		});

		stripePrice = await stripeCli.prices.create({
			...productData,
			unit_amount_decimal: unitAmountDecimalStr,
			currency: orgToCurrency({ org }),
		});

		config.stripe_product_id = stripePrice.product as string;
		config.stripe_price_id = stripePrice.id;
	} else {
		const priceConfigTiers = price.config.usage_tiers;
		let priceAmountData: Partial<Stripe.PriceCreateParams>;
		if (priceConfigTiers?.length === 1) {
			priceAmountData = {
				unit_amount_decimal: atmnToStripeAmountDecimal({
					amount: priceConfigTiers[0].amount,
					currency: orgToCurrency({ org }),
				}),
			};
		} else {
			priceAmountData = {
				billing_scheme: "tiered",
				tiers_mode: "graduated",
				tiers: prepaidToStripeTiers({ ent, price, org }),
			};
		}
		stripePrice = await stripeCli.prices.create({
			...productData,
			currency: orgToCurrency({ org }),
			...priceAmountData,
			recurring: {
				...(recurringData as any),
			},
			nickname: `Autumn Price (${ent.feature.name})`,
		});
		config.stripe_price_id = stripePrice.id;
		config.stripe_product_id = stripePrice.product as string;
	}

	// New config
	price.config = config;
	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
