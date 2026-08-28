import {
	BillingType,
	type BillingVersion,
	type EntitlementWithFeature,
	ErrCode,
	type FullProduct,
	getPriceCurrencyStripeId,
	LATEST_BILLING_VERSION,
	type Price,
	priceHasCurrencyAmounts,
	priceToEnt,
	priceToRequiredStripeSlots,
	priceUtils,
	type StripePriceNicknameSource,
	RecaseError,
	type RequiredStripeResourceSlot,
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
import { resolveStripeProductForFeaturePrice } from "@/external/stripe/products/utils/resolveStripeProductForFeaturePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	createStripeArrearProrated,
	createStripeMeteredPrice,
} from "./createStripeArrearProrated";
import { createStripeEmptyPrice } from "./createStripeEmptyPrice";
import { createStripeFixedPrice } from "./createStripeFixedPrice";
import { createStripeInArrearPrice } from "./createStripeInArrear";
import { createStripeOneOffTieredProduct } from "./createStripeOneOffTiered";
import { createStripePrepaid } from "./createStripePrepaid";

const CREATE_STRIPE_EMPTY_PRICES = false;

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

	const getStripeEmptyPrice = async () => {
		let stripeEmptyPrice: Stripe.Price | undefined;
		if (!config.stripe_empty_price_id) {
			stripeEmptyPrice = undefined;
		} else {
			stripeEmptyPrice = await getStripePrice({
				stripeClient: stripeCli,
				stripePriceId: config.stripe_empty_price_id,
			});
		}
		return stripeEmptyPrice;
	};

	const [stripeEmptyPrice, stripePrepaidPriceV2] = await Promise.all([
		CREATE_STRIPE_EMPTY_PRICES ? getStripeEmptyPrice() : undefined,
		getStripePrepaidPriceV2(),
	]);

	return {
		stripePrice,
		stripeEmptyPrice,
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
	currency: targetCurrency,
	billingVersion = LATEST_BILLING_VERSION,
	source = "catalog",
}: {
	ctx: AutumnContext;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: FullProduct;
	internalEntityId?: string;
	useCheckout?: boolean;
	currency?: string;
	billingVersion?: BillingVersion;
	source?: StripePriceNicknameSource;
}) => {
	// Fetch latest price data...

	const { org, logger, db, env } = ctx;
	assertNoPreviewStripeIdsOnProduct({ product });
	const stripeCli = createStripeCli({ org, env });

	const config = price.config! as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const billingType = getBillingType(price.config!);
	const requiredSlots = new Set(
		priceToRequiredStripeSlots({ price, product, billingVersion }),
	);
	const requiresSlot = (slot: RequiredStripeResourceSlot) =>
		requiredSlots.has(slot);

	const isFixed =
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff;
	if (!priceHasCurrencyAmounts({ config, currency, orgDefault, isFixed })) {
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: `Price ${price.id} has no '${currency}' amounts in config.currencies — cannot create a Stripe price in that currency`,
			statusCode: 400,
		});
	}

	const { stripePrice, stripeEmptyPrice, stripePrepaidPriceV2, stripeProd } =
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

	if (!isFixed && !stripeProd) {
		const feature = priceToEnt({ price, entitlements })?.feature;
		if (feature) {
			config.stripe_product_id = await resolveStripeProductForFeaturePrice({
				db,
				stripeCli,
				feature,
				price,
			});
			await PriceService.update({
				db,
				id: price.id!,
				update: { config },
			});
		}
	}

	const resolvedStripeProduct = config.stripe_product_id
		? { id: config.stripe_product_id }
		: stripeProd;

	const isOneOffAndTiered = priceUtils.isTieredOneOff({ price, product });

	// 1. If fixed price, just create price
	if (
		billingType === BillingType.FixedCycle ||
		billingType === BillingType.OneOff
	) {
		if (requiresSlot("stripe_price_id") && !stripePrice) {
			await createStripeFixedPrice({
				db,
				stripeCli,
				price,
				product,
				org,
				currency,
				source,
			});
		}
	}

	// 2. If prepaid
	if (billingType === BillingType.UsageInAdvance) {
		if (
			isOneOffAndTiered &&
			requiresSlot("stripe_product_id") &&
			!resolvedStripeProduct
		) {
			logger.info(`Creating stripe one off tiered product`);
			await createStripeOneOffTieredProduct({
				db,
				stripeCli,
				price,
				entitlements,
				product,
				stripeProductId: config.stripe_product_id!,
			});
		}

		if (!isOneOffAndTiered && requiresSlot("stripe_price_id") && !stripePrice) {
			logger.info(`Creating stripe prepaid price`);
			await createStripePrepaid({
				db,
				stripeCli,
				price,
				entitlements,
				product,
				org,
				curStripeProd: resolvedStripeProduct,
				currency,
				source,
			});
		}

		if (
			!isOneOffAndTiered &&
			requiresSlot("stripe_prepaid_price_v2_id") &&
			!stripePrepaidPriceV2
		) {
			logger.info(`Creating stripe v2 prepaid price`);
			await createStripePrepaidPriceV2({
				ctx,
				price,
				product,
				currentStripeProduct: resolvedStripeProduct ?? undefined,
				currency,
				source,
			});
		}
	}

	if (billingType === BillingType.InArrearProrated) {
		const placeholderPriceId = getPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_placeholder_price_id",
		});
		if (requiresSlot("stripe_price_id") && !stripePrice) {
			logger.info(`Creating stripe in arrear prorated product`);
			await createStripeArrearProrated({
				db,
				stripeCli,
				price,
				entitlements,
				product,
				org,
				curStripeProd: resolvedStripeProduct,
				currency,
				mintPlaceholder: requiresSlot("stripe_placeholder_price_id"),
				source,
			});
		} else if (
			requiresSlot("stripe_placeholder_price_id") &&
			!placeholderPriceId
		) {
			logger.info(`Creating stripe placeholder price`);
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
			curStripeProduct: resolvedStripeProduct,
			internalEntityId,
			useCheckout,
			currency,
			source,
		});

		if (CREATE_STRIPE_EMPTY_PRICES && !stripeEmptyPrice) {
			await createStripeEmptyPrice({
				db,
				stripeCli,
				price,
				product,
				org,
				logger,
				currency,
			});
		}
	}
};
