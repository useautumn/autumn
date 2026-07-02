import {
	BillingType,
	type EntitlementWithFeature,
	type FullProduct,
	getPriceCurrencyStripeId,
	isBaseCurrency,
	type Price,
	priceUtils,
	setPriceCurrencyStripeId,
	type UsagePriceConfig,
} from "@autumn/shared";
import { PriceService } from "@server/internal/products/prices/PriceService";
import { getBillingType } from "@server/internal/products/prices/priceUtils";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripePrepaidPriceV2 } from "@/external/stripe/createStripePrice/createStripePrepaidPriceV2.js";
import { assertNoPreviewStripeIdsOnProduct } from "@/external/stripe/previewStripeResourceIds.js";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import {
	createStripeArrearProrated,
	createStripeMeteredPrice,
} from "./createStripeArrearProrated";
import { createStripeFixedPrice } from "./createStripeFixedPrice";
import { createStripeInArrearPrice } from "./createStripeInArrear";
import { createStripeOneOffTieredProduct } from "./createStripeOneOffTiered";
import { createStripePrepaid } from "./createStripePrepaid";

const checkCurStripePrice = async ({
	price,
	stripeCli,
	currency,
	orgDefault,
}: {
	price: Price;
	stripeCli: Stripe;
	currency: string;
	orgDefault: string;
}) => {
	const config = price.config! as UsagePriceConfig;
	const stripePriceId = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
	});
	const emptyPriceId = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_empty_price_id",
	});
	const prepaidV2Id = getPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_prepaid_price_v2_id",
	});

	let stripePrice: Stripe.Price | null = null;
	if (!stripePriceId) {
		stripePrice = null;
	} else {
		try {
			stripePrice = await stripeCli.prices.retrieve(stripePriceId, {
				expand: ["product"],
			});

			if (!stripePrice.active) {
				stripePrice = await stripeCli.prices.update(stripePriceId, {
					active: true,
				});
			}

			if (
				stripePrice &&
				stripePrice.currency.toLowerCase() !== currency.toLowerCase()
			) {
				stripePrice = null;
			}
		} catch (_error) {
			if (
				_error instanceof Stripe.errors.StripeError &&
				_error.code?.includes("resource_missing")
			) {
				stripePrice = null;
			} else {
				throw _error;
			}
		}
	}

	// Get stripe product
	let stripeProd: Stripe.Product | null = null;
	if (!config.stripe_product_id) {
		stripeProd = null;
	} else {
		try {
			stripeProd = await stripeCli.products.retrieve(config.stripe_product_id!);
			if (!stripeProd.active) {
				stripeProd = null;
			}
		} catch (_error) {
			stripeProd = null;
		}
	}

	const getStripeEmptyPrice = async () => {
		let stripeEmptyPrice: Stripe.Price | undefined;
		if (!emptyPriceId) {
			stripeEmptyPrice = undefined;
		} else {
			stripeEmptyPrice = await getStripePrice({
				stripeClient: stripeCli,
				stripePriceId: emptyPriceId,
			});
		}
		return stripeEmptyPrice;
	};

	const getStripePrepaidPriceV2 = async () => {
		let stripePrepaidPriceV2: Stripe.Price | undefined;
		if (!prepaidV2Id) {
			stripePrepaidPriceV2 = undefined;
		} else {
			stripePrepaidPriceV2 = await getStripePrice({
				stripeClient: stripeCli,
				stripePriceId: prepaidV2Id,
			});
		}

		return stripePrepaidPriceV2;
	};

	const [stripeEmptyPrice, stripePrepaidPriceV2] = await Promise.all([
		getStripeEmptyPrice(),
		getStripePrepaidPriceV2(),
	]);

	return {
		stripePrice,
		stripePrepaidPriceV2,
		stripeEmptyPrice,
		stripeProd,
	};
};

export const createStripePriceIFNotExist = async ({
	ctx,
	price,
	entitlements,
	product,
	internalEntityId,
	useCheckout = false,
	currency: targetCurrency,
}: {
	ctx: AutumnContext;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: FullProduct;
	internalEntityId?: string;
	useCheckout?: boolean;
	currency?: string;
}) => {
	// Fetch latest price data...

	const { org, logger, db, env } = ctx;
	assertNoPreviewStripeIdsOnProduct({ product });
	const stripeCli = createStripeCli({ org, env });

	const config = price.config! as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	// Default to the price's base currency (not the live org default) so a
	// no-currency call always resolves as base even if the org default drifted.
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const billingType = getBillingType(price.config!);

	// Only fixed / one-off creators are currency-aware so far (Phase 2c). Fail loud
	// rather than silently create a non-fixed price in the base slot/currency.
	if (
		!isBaseCurrency({ config, currency, orgDefault }) &&
		billingType !== BillingType.FixedCycle &&
		billingType !== BillingType.OneOff
	) {
		throw new Error(
			`Per-currency Stripe price creation for billing type '${billingType}' is not yet implemented (multi-currency Phase 2d)`,
		);
	}

	const { stripePrice, stripePrepaidPriceV2, stripeProd, stripeEmptyPrice } =
		await checkCurStripePrice({
			price,
			stripeCli,
			currency,
			orgDefault,
		});

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
		id: stripePrice?.id,
	});
	config.stripe_product_id = stripeProd?.id;

	const isOneOffAndTiered = priceUtils.isTieredOneOff({ price, product });

	// 1. If fixed price, just create price
	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		if (!stripePrice) {
			await createStripeFixedPrice({
				db,
				stripeCli,
				price,
				product,
				org,
				currency,
			});
		}
	}

	// 2. If prepaid
	if (billingType === BillingType.UsageInAdvance) {
		if (isOneOffAndTiered && !stripeProd) {
			logger.info(`Creating stripe one off tiered product`);
			await createStripeOneOffTieredProduct({
				db,
				stripeCli,
				price,
				entitlements,
				product,
			});
		}

		if (!isOneOffAndTiered && !stripePrice) {
			logger.info(`Creating stripe prepaid price`);
			await createStripePrepaid({
				db,
				stripeCli,
				price,
				entitlements,
				product,
				org,
				curStripeProd: stripeProd,
			});
		}

		if (!isOneOffAndTiered && !stripePrepaidPriceV2) {
			logger.info(`Creating stripe v2 prepaid price`);
			await createStripePrepaidPriceV2({
				ctx,
				price,
				product,
				currentStripeProduct: stripeProd ?? undefined,
			});
		}
	}

	if (billingType === BillingType.InArrearProrated) {
		if (!stripePrice) {
			logger.info(`Creating stripe in arrear prorated product`);
			await createStripeArrearProrated({
				db,
				stripeCli,
				price,
				entitlements,
				product,
				org,
				curStripeProd: stripeProd,
			});
		} else if (!config.stripe_placeholder_price_id) {
			logger.info(`Creating stripe placeholder price`);
			const placeholderPrice = await createStripeMeteredPrice({
				stripeCli,
				price,
				entitlements,
				product,
				org,
			});
			config.stripe_placeholder_price_id = placeholderPrice.id;
			await PriceService.update({
				db,
				id: price.id!,
				update: { config },
			});
		}
	}

	if (billingType === BillingType.UsageInArrear) {
		await createStripeInArrearPrice({
			db,
			stripeCli,
			price,
			entitlements,
			product,
			org,
			logger,
			curStripePrice: stripePrice,
			curStripeProduct: stripeProd,
			internalEntityId,
			useCheckout,
		});

		if (!stripeEmptyPrice) {
			try {
				logger.info(`Creating stripe empty price`);
				// console.log(`Product: ${config.stripe_product_id || stripeProd?.id}`);
				const emptyPrice = await stripeCli.prices.create({
					// product: stripeProd!.id,
					product: config.stripe_product_id || product.processor?.id,
					unit_amount: 0,
					currency: org.default_currency || "usd",
					recurring: {
						...(billingIntervalToStripe({
							interval: price.config!.interval!,
							intervalCount: price.config!.interval_count!,
						}) as any),
					},
				});

				config.stripe_empty_price_id = emptyPrice.id;
				await PriceService.update({
					db,
					id: price.id!,
					update: { config },
				});
			} catch (error) {
				logger.error(`Error creating stripe empty price!`, {
					error,
				});
			}
		}
	}
};
