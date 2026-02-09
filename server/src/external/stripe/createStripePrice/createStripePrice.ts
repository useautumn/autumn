import {
	BillingType,
	type EntitlementWithFeature,
	type FullProduct,
	type Price,
	priceUtils,
	type UsagePriceConfig,
} from "@autumn/shared";
import { PriceService } from "@server/internal/products/prices/PriceService";
import { getBillingType } from "@server/internal/products/prices/priceUtils";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripePrepaidPriceV2 } from "@/external/stripe/createStripePrice/createStripePrepaidPriceV2.js";
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
}: {
	price: Price;
	stripeCli: Stripe;
	currency: string;
}) => {
	const config = price.config! as UsagePriceConfig;

	let stripePrice: Stripe.Price | null = null;
	if (!config.stripe_price_id) {
		stripePrice = null;
	} else {
		try {
			stripePrice = await stripeCli.prices.retrieve(config.stripe_price_id!, {
				expand: ["product"],
			});

			if (!stripePrice.active) {
				stripePrice = await stripeCli.prices.update(config.stripe_price_id!, {
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

	let stripePrepaidPriceV2: Stripe.Price | undefined;
	if (config.stripe_prepaid_price_v2_id) {
		stripePrepaidPriceV2 = undefined;
	} else {
		stripePrepaidPriceV2 = await getStripePrice({
			stripeClient: stripeCli,
			stripePriceId: config.stripe_prepaid_price_v2_id ?? undefined,
		});
	}

	return {
		stripePrice,
		stripePrepaidPriceV2,
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
}: {
	ctx: AutumnContext;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: FullProduct;
	internalEntityId?: string;
	useCheckout?: boolean;
}) => {
	// Fetch latest price data...

	const { org, logger, db, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const billingType = getBillingType(price.config!);

	const { stripePrice, stripePrepaidPriceV2, stripeProd } =
		await checkCurStripePrice({
			price,
			stripeCli,
			currency: org.default_currency || "usd",
		});

	const config = price.config! as UsagePriceConfig;
	config.stripe_price_id = stripePrice?.id;
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
				currentStripeProduct: stripePrepaidPriceV2,
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

		if (!config.stripe_empty_price_id) {
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
