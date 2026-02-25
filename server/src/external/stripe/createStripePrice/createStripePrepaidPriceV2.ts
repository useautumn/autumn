import {
	ErrCode,
	type FullProduct,
	type Price,
	priceToEnt,
	priceUtils,
	RecaseError,
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

	// 1. If no entitlement, re-use current stripe price
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	if (!entitlement?.allowance) {
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
