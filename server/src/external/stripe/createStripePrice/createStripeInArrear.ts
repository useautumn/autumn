import {
	atmnToStripeAmountDecimal,
	type Entitlement,
	type EntitlementWithFeature,
	ErrCode,
	type Feature,
	type Organization,
	type Price,
	type Product,
	priceConfigForCurrency,
	priceToEnt,
	setPriceCurrencyStripeId,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import RecaseError from "@server/utils/errorUtils";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils";

const searchStripeMeter = async ({
	stripeCli,
	eventName,
	meterId,
	logger,
}: {
	stripeCli: Stripe;
	eventName: string;
	meterId?: string;
	logger: any;
}) => {
	const allStripeMeters = [];
	let hasMore = true;
	let startingAfter: string | undefined;

	const start = performance.now();
	// Get max 200 meters
	while (hasMore) {
		const response: any = await stripeCli.billing.meters.list({
			limit: 100,
			status: "active",
			starting_after: startingAfter,
		});

		allStripeMeters.push(...response.data);
		hasMore = response.has_more;

		if (hasMore && response.data.length > 0) {
			startingAfter = response.data[response.data.length - 1].id;
		}
	}
	const end = performance.now();
	logger.info(`Stripe meter list took ${end - start}ms`);

	const stripeMeter = allStripeMeters.find(
		(m) => m.event_name === eventName || m.id === meterId,
	);

	return stripeMeter;
};

const getStripeMeter = async ({
	product,
	feature,
	stripeCli,
	price,
	logger,
}: {
	product: Product;
	feature: Feature;
	stripeCli: Stripe;
	price: Price;
	logger: any;
}) => {
	const config = price.config as UsagePriceConfig;

	try {
		const stripeMeter = await searchStripeMeter({
			stripeCli,
			eventName: price.id!,
			meterId: config.stripe_meter_id!,
			logger,
		});

		if (stripeMeter) {
			logger.info(
				`✅ Found existing meter for ${product.name} - ${feature!.name}`,
			);
			return stripeMeter;
		}
	} catch (_error) {}

	const meter = await stripeCli.billing.meters.create({
		display_name: `${product.name} - ${feature!.name}`,
		event_name: price.id!,
		default_aggregation: {
			formula: "sum",
		},
	});
	return meter;
};

// IN ARREAR
export const priceToInArrearTiers = ({
	price,
	entitlement,
	org,
	currency: targetCurrency,
}: {
	price: Price;
	entitlement: Entitlement;
	org: Organization;
	currency?: string;
}) => {
	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();
	// Cloned so the allowance shift below never mutates the persisted config.
	const usageTiers = structuredClone(
		priceConfigForCurrency({ config, currency, orgDefault }).usage_tiers ??
			config.usage_tiers,
	);

	const tiers: any[] = [];
	if (entitlement.allowance) {
		tiers.push({
			unit_amount: 0,
			up_to: entitlement.allowance,
		});

		for (const tier of usageTiers) {
			if (tier.to !== -1 && tier.to !== TierInfinite) {
				tier.to = (tier.to || 0) + entitlement.allowance;
			}
		}
	}

	for (const tier of usageTiers) {
		const atmnUnitAmount = new Decimal(tier.amount).div(
			config.billing_units ?? 1,
		);

		const stripeUnitAmountDecimal = atmnToStripeAmountDecimal({
			amount: atmnUnitAmount,
			currency,
		});

		const stripeTier: Record<string, unknown> = {
			unit_amount_decimal: stripeUnitAmountDecimal,
			up_to: tier.to === -1 ? "inf" : tier.to,
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

export const createStripeInArrearPrice = async ({
	db,
	stripeCli,
	product,
	price,
	entitlements,
	org,
	logger,
	curStripePrice,
	curStripeProduct,
	internalEntityId,
	useCheckout = false,
	currency: targetCurrency,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	product: Product;
	price: Price;
	org: Organization;
	entitlements: EntitlementWithFeature[];
	logger: any;
	curStripePrice?: Stripe.Price | null;
	curStripeProduct?: Stripe.Product | null;
	internalEntityId?: string;
	useCheckout?: boolean;
	currency?: string;
}) => {
	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	// 1. Create meter
	const relatedEnt = priceToEnt({
		price,
		entitlements,
	});
	const feature = relatedEnt?.feature;

	// // 1. If internal entity ID and not curStripe product, create product
	// if (internalEntityId && !useCheckout) {
	// 	if (!curStripeProduct) {
	// 		logger.info(
	// 			`Creating stripe in arrear product for ${relatedEnt?.feature.name} (internal entity ID exists!)`,
	// 		);
	// 		const stripeProduct = await stripeCli.products.create({
	// 			name: `${product.name} - ${feature!.name}`,
	// 		});
	// 		config.stripe_product_id = stripeProduct.id;

	// 		await PriceService.update({
	// 			db,
	// 			id: price.id,
	// 			update: { config },
	// 		});
	// 	}
	// 	return;
	// }

	// 2. If no internal entity ID, create Stripe price if not exists...
	if (curStripePrice) {
		return;
	}

	logger.info(
		`Creating stripe in arrear price for ${relatedEnt?.feature.name} (no internal entity ID)`,
	);

	if (!feature) {
		throw new RecaseError({
			message: `createStripeInArrearPrice: feature not found for price ${price.id}`,
			code: ErrCode.FeatureNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	// 1. Get meter by event_name
	const meter = await getStripeMeter({
		product,
		feature,
		stripeCli,
		price,
		logger,
	});

	config.stripe_meter_id = meter.id;

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

	let productData = {};
	const stripeProductId = curStripeProduct?.id || config.stripe_product_id;
	if (stripeProductId) {
		productData = {
			product: stripeProductId,
		};
	} else {
		productData = {
			product_data: {
				name: `${product.name} - ${feature.name}`,
			},
		};
	}

	const recurringData = billingIntervalToStripe({
		interval: price.config.interval!,
		intervalCount: price.config.interval_count,
	});

	const stripePrice = await stripeCli.prices.create({
		...productData,
		...priceAmountData,
		currency,
		recurring: recurringData?.interval
			? {
					interval: recurringData.interval,
					interval_count: recurringData.interval_count,
					meter: meter.id,
					usage_type: "metered",
				}
			: undefined,
		nickname: `Autumn Price (${relatedEnt.feature.name})`,
	});

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
		id: stripePrice.id,
	});
	config.stripe_product_id = stripePrice.product as string;
	config.stripe_meter_id = meter.id;

	await PriceService.update({
		db,
		id: price.id,
		update: { config },
	});
};
