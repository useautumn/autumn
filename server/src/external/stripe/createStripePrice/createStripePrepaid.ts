import {
	atmnToStripeAmountDecimal,
	BillingInterval,
	type EntitlementWithFeature,
	type Organization,
	type Price,
	type Product,
	priceConfigForCurrency,
	priceToStripeTiersMode,
	setPriceCurrencyStripeId,
	TierInfinite,
	type UsagePriceConfig,
	type UsageTier,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import { getPriceEntitlement } from "@server/internal/products/prices/priceUtils";
import type Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils";

const prepaidToStripeTiers = ({
	usageTiers,
	billingUnits,
	currency,
}: {
	usageTiers: UsageTier[];
	billingUnits: number | null | undefined;
	currency: string;
}) => {
	const tiers: any[] = [];

	for (const tier of usageTiers) {
		const amount = atmnToStripeAmountDecimal({
			amount: tier.amount,
			currency,
		});
		const upTo =
			tier.to === -1 || tier.to === TierInfinite
				? "inf"
				: Math.round(tier.to / billingUnits!);

		const stripeTier: Record<string, unknown> = {
			unit_amount_decimal: amount,
			up_to: upTo,
		};

		if (tier.flat_amount) {
			stripeTier.flat_amount_decimal = atmnToStripeAmountDecimal({
				amount: tier.flat_amount,
				currency,
			});
		}

		tiers.push(stripeTier);
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
	currency: targetCurrency,
}: {
	db: DrizzleCli;
	price: Price;
	product: Product;
	org: Organization;
	entitlements: EntitlementWithFeature[];
	curStripeProd: Stripe.Product | null;
	stripeCli: Stripe;
	currency?: string;
}) => {
	const relatedEnt = getPriceEntitlement(price, entitlements);

	let recurringData: Partial<Stripe.PriceCreateParams.Recurring> | undefined;
	if (price.config!.interval !== BillingInterval.OneOff) {
		recurringData = {
			...billingIntervalToStripe({
				interval: price.config!.interval,
				intervalCount: price.config!.interval_count,
			}),
		};
	}

	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();
	// Amounts for the target currency; never persisted back into the base config.
	const currencyTiers =
		priceConfigForCurrency({ config, currency, orgDefault }).usage_tiers ??
		config.usage_tiers;

	const productName = `${product.name} - ${relatedEnt.feature.name}`;

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
		const amount = currencyTiers[0].amount;

		const unitAmountDecimalStr = atmnToStripeAmountDecimal({
			amount,
			currency,
		});

		stripePrice = await stripeCli.prices.create({
			...productData,
			unit_amount_decimal: unitAmountDecimalStr,
			currency,
		});

		config.stripe_product_id = stripePrice.product as string;
	} else {
		const tiers = prepaidToStripeTiers({
			usageTiers: currencyTiers,
			billingUnits: config.billing_units,
			currency,
		});
		const tiersMode = priceToStripeTiersMode({ price });

		let priceAmountData = {};
		if (tiers.length === 1) {
			priceAmountData = {
				unit_amount_decimal: tiers[0].unit_amount_decimal,
			};
		} else {
			priceAmountData = {
				billing_scheme: "tiered",
				tiers_mode: tiersMode,
				tiers: tiers,
			};
		}

		stripePrice = await stripeCli.prices.create({
			...productData,
			currency,
			...priceAmountData,
			recurring: {
				...(recurringData as any),
			},
			nickname: `Autumn Price (${relatedEnt.feature.name})`,
		});

		config.stripe_product_id = stripePrice.product as string;
	}

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
		id: stripePrice.id,
	});

	// New config
	price.config = config;
	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
