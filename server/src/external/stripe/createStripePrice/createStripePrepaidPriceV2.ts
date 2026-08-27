import {
	ErrCode,
	type FullProduct,
	getPriceCurrencyStripeId,
	type Price,
	type StripePriceNicknameSource,
	priceToEnt,
	priceUtils,
	RecaseError,
	setPriceCurrencyStripeId,
	type UsagePriceConfig,
} from "@autumn/shared";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { buildStripePriceIdempotencyKey } from "@/external/stripe/prices/utils/buildIdempotencyKey";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const createStripePrepaidPriceV2 = async ({
	ctx,
	price,
	product,
	currentStripeProduct,
	currency: targetCurrency,
	source = "catalog",
}: {
	ctx: AutumnContext;
	price: Price;
	product: FullProduct;
	currentStripeProduct?: { id: string };
	currency?: string;
	source?: StripePriceNicknameSource;
}) => {
	const { org, db, env } = ctx;

	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	const existingV1PriceId = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
	});
	if (!entitlement?.allowance && existingV1PriceId) {
		setPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_prepaid_price_v2_id",
			id: existingV1PriceId,
		});
		price.config = config;

		await PriceService.update({
			db,
			id: price.id!,
			update: { config },
		});

		return;
	}

	if (
		entitlement?.allowance &&
		entitlement.allowance % (price.config.billing_units ?? 1) !== 0
	) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"If you have a plan feature with both an included usage and a price, the included usage must be an amount that is divisible by the billing units.",
		});
	}

	const stripeProductId =
		currentStripeProduct?.id ?? config.stripe_product_id ?? undefined;
	if (!stripeProductId) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: `createStripePrepaidPriceV2: missing Stripe product for price ${price.id}`,
		});
	}

	const stripeCreatePriceParams = priceUtils.convert.toStripeCreatePriceParams({
		price,
		product,
		org,
		stripeProductId,
		currency,
		source,
	});

	const stripeCli = createStripeCli({ org, env });

	const stripePrice = await stripeCli.prices.create(stripeCreatePriceParams, {
		idempotencyKey: buildStripePriceIdempotencyKey({
			priceId: price.id!,
			slot: "stripe_prepaid_price_v2_id",
			currency,
		}),
	});

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_prepaid_price_v2_id",
		id: stripePrice.id,
	});
	config.stripe_product_id = stripePrice.product as string;
	price.config = config;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
