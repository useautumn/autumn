import {
	ErrCode,
	type FullProduct,
	type Price,
	priceToEnt,
	priceUtils,
	RecaseError,
	TierBehaviours,
	type UsagePriceConfig,
} from "@autumn/shared";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const createStripePrepaidPriceV2 = async ({
	ctx,
	price,
	product,
	currentStripeProduct,
}: {
	ctx: AutumnContext;
	price: Price;
	product: FullProduct;
	currentStripeProduct?: Stripe.Product;
}) => {
	const { org, db, env } = ctx;

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	const isVolume = price.tier_behaviour === TierBehaviours.VolumeBased;

	// A separate V2 Stripe price is only needed for graduated prices that have
	// an allowance. In that case, priceToStripePrepaidV2Tiers encodes the free
	// units as a $0 leading tier and shifts all paid-tier boundaries up by the
	// allowance, so Stripe's graduated splitting produces the right charge.
	//
	// In every other case stripe_prepaid_price_v2_id just points at the same
	// Stripe price as stripe_price_id:
	//
	//   No allowance — the V2 price would be identical to V1 (nothing to shift),
	//   so there is no point creating a second Stripe object.
	//
	//   Volume + allowance — the free-tier-offset trick does not work with
	//   Stripe's volume mode because volume charges the *entire* quantity at
	//   one rate, so a $0 leading tier corrupts the math. Instead the allowance
	//   is tracked purely by Autumn; Stripe only ever sees the purchased packs
	//   (see featureOptionsToV2StripeQuantity). The V1 price tiers are already
	//   correct for that, so reuse it.
	if (!entitlement?.allowance || isVolume) {
		price.config = {
			...(price.config as UsagePriceConfig),
			stripe_prepaid_price_v2_id: price.config.stripe_price_id,
		};

		await PriceService.update({
			db,
			id: price.id!,
			update: {
				config: {
					...(price.config as UsagePriceConfig),
					stripe_prepaid_price_v2_id: price.config.stripe_price_id,
				},
			},
		});

		return;
	}

	if (entitlement.allowance % (price.config.billing_units ?? 1) !== 0) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"If you have a plan feature with both an included usage and a price, the included usage must be an amount that is divisible by the billing units.",
		});
	}

	const stripeCreatePriceParams = priceUtils.convert.toStripeCreatePriceParams({
		price,
		product,
		org,
		currentStripeProduct,
	});

	const stripeCli = createStripeCli({ org, env });

	const stripePrice = await stripeCli.prices.create(stripeCreatePriceParams);

	price.config = {
		...(price.config as UsagePriceConfig),
		stripe_prepaid_price_v2_id: stripePrice.id,
		// stripe_product_id: stripePrice.product as string,
	};

	await PriceService.update({
		db,
		id: price.id!,
		update: {
			config: {
				...(price.config as UsagePriceConfig),
				stripe_prepaid_price_v2_id: stripePrice.id,
				// stripe_product_id: stripePrice.product as string,
			},
		},
	});
};
