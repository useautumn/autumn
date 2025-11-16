import {
	BillingType,
	type EntitlementWithFeature,
	type Organization,
	type Price,
	type Product,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	getBillingType,
	getPriceEntitlement,
	priceIsOneOffAndTiered,
} from "@/internal/products/prices/priceUtils.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";
import {
	createStripeArrearProrated,
	createStripeMeteredPrice,
} from "./createStripeArrearProrated.js";
import { createStripeFixedPrice } from "./createStripeFixedPrice.js";
import { createStripeInArrearPrice } from "./createStripeInArrear.js";
import { createStripeOneOffTieredProduct } from "./createStripeOneOffTiered.js";
import { createStripePrepaid } from "./createStripePrepaid.js";

export const checkCurStripePrice = async ({
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
			stripePrice = null;
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

	return {
		stripePrice,
		stripeProd,
	};
};

export const createStripePriceIFNotExist = async ({
	db,
	stripeCli,
	price,
	entitlements,
	product,
	org,
	logger,
	internalEntityId,
	useCheckout = false,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: Product;
	org: Organization;
	logger: any;
	internalEntityId?: string;
	useCheckout?: boolean;
}) => {
	// Fetch latest price data...

	const billingType = getBillingType(price.config!);

	const { stripePrice, stripeProd } = await checkCurStripePrice({
		price,
		stripeCli,
		currency: org.default_currency || "usd",
	});

	const config = price.config! as UsagePriceConfig;
	config.stripe_price_id = stripePrice?.id;
	config.stripe_product_id = stripeProd?.id;

	const relatedEnt = getPriceEntitlement(price, entitlements);
	const isOneOffAndTiered = priceIsOneOffAndTiered(price, relatedEnt);

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
