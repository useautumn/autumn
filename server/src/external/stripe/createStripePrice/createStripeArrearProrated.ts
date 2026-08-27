import {
	BillingInterval,
	BillingType,
	type EntitlementWithFeature,
	ErrCode,
	type Organization,
	type Price,
	type Product,
	setPriceCurrencyStripeId,
	TierInfinite,
	type UsagePriceConfig,
	RecaseError,
	priceToStripeNickname,
	type StripePriceNicknameSource,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import {
	getBillingType,
	getPriceEntitlement,
} from "@server/internal/products/prices/priceUtils";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { buildStripePriceIdempotencyKey } from "../prices/utils/buildIdempotencyKey";
import { billingIntervalToStripe } from "../stripePriceUtils";
import { priceToInArrearTiers } from "./createStripeInArrear";

interface StripeMeteredPriceParams {
	stripeCli: Stripe;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: Product;
	org: Organization;
	currency?: string;
	source?: StripePriceNicknameSource;
}

export const createStripeMeteredPrice = async ({
	stripeCli,
	price,
	entitlements,
	product,
	org,
	currency: targetCurrency,
	source = "catalog",
}: StripeMeteredPriceParams) => {
	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();
	const ent = getPriceEntitlement(price, entitlements);
	const feature = ent.feature;

	let meter;
	try {
		meter = await stripeCli.billing.meters.create({
			display_name: `${product.name} - ${feature!.name}`,
			event_name: price.id!,
			default_aggregation: {
				formula: "sum",
			},
		});
	} catch (error: any) {
		const meters = await stripeCli.billing.meters.list({
			limit: 100,
			status: "active",
		});
		meter = meters.data.find((m) => m.event_name === price.id);
		if (!meter) {
			throw error;
		}
	}

	const tiers = priceToInArrearTiers({
		price,
		entitlement: ent,
		org,
		currency,
	});

	let priceAmountData = {};
	if (ent.allowance === 0 && tiers.length === 1) {
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

	if (!config.stripe_product_id) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `createStripeMeteredPrice: missing Stripe product for feature ${feature!.id}`,
		});
	}

	const stripePrice = await stripeCli.prices.create({
		product: config.stripe_product_id,
		...priceAmountData,
		currency,
		nickname: priceToStripeNickname({
			price,
			featureName: feature!.name,
			source,
			isPlaceholder: true,
		}),
		recurring: {
			...(billingIntervalToStripe({
				interval: price.config!.interval,
				intervalCount: price.config!.interval_count,
			}) as any),
			meter: meter!.id,
			usage_type: "metered",
		},
	});

	return stripePrice;
};

const arrearProratedToStripeTiers = (
	price: Price,
	entitlement: EntitlementWithFeature,
) => {
	const usageConfig = structuredClone(price.config) as UsagePriceConfig;

	const billingUnits = usageConfig.billing_units;
	const numFree = entitlement.allowance
		? Math.round(entitlement.allowance! / billingUnits!)
		: 0;

	const tiers: any[] = [];

	if (numFree > 0) {
		tiers.push({
			unit_amount_decimal: 0,
			up_to: numFree,
		});
	}
	for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
		const tier = usageConfig.usage_tiers[i];
		const amount = new Decimal(tier.amount).mul(100).toNumber();
		const upTo =
			tier.to === -1 || tier.to === TierInfinite
				? "inf"
				: Math.round((tier.to - numFree) / billingUnits!) + numFree;

		tiers.push({
			unit_amount_decimal: amount,
			up_to: upTo,
		});
	}

	return tiers;
};

export const createStripeArrearProrated = async ({
	db,
	price,
	product,
	org,
	entitlements,
	curStripeProd,
	stripeCli,
	currency: targetCurrency,
	mintPlaceholder = true,
	source = "catalog",
}: {
	db: DrizzleCli;
	price: Price;
	product: Product;
	org: Organization;
	entitlements: EntitlementWithFeature[];
	curStripeProd: { id: string } | null;
	stripeCli: Stripe;
	currency?: string;
	mintPlaceholder?: boolean;
	source?: StripePriceNicknameSource;
}) => {
	const relatedEnt = getPriceEntitlement(price, entitlements);

	let recurringData;
	if (price.config!.interval !== BillingInterval.OneOff) {
		recurringData = billingIntervalToStripe({
			interval: price.config!.interval,
			intervalCount: price.config!.interval_count,
		});
	}

	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const stripeProductId = curStripeProd?.id ?? config.stripe_product_id;
	if (!stripeProductId) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `createStripeArrearProrated: missing Stripe product for feature ${relatedEnt.feature.id}`,
		});
	}

	// let tiers = arrearProratedToStripeTiers(price, relatedEnt);
	const tiers = priceToInArrearTiers({
		price,
		entitlement: relatedEnt,
		org,
		currency,
	});

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

	const stripePrice = await stripeCli.prices.create(
		{
			product: stripeProductId,
			currency,
			...priceAmountData,
			recurring: {
				...(recurringData as any),
			},
			nickname: priceToStripeNickname({
				price,
				featureName: relatedEnt.feature.name,
				source,
			}),
		},
		{
			idempotencyKey: buildStripePriceIdempotencyKey({
				price,
				slot: "stripe_price_id",
				currency,
				orgDefault,
			}),
		},
	);

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
		id: stripePrice.id,
	});
	config.stripe_product_id = stripePrice.product as string;
	const billingType = getBillingType(price.config);

	if (mintPlaceholder && billingType === BillingType.InArrearProrated) {
		const placeholderPrice = await createStripeMeteredPrice({
			stripeCli,
			price,
			entitlements,
			product,
			org,
			currency,
			source,
		});
		setPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_placeholder_price_id",
			id: placeholderPrice.id,
		});
	}

	price.config = config;
	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
