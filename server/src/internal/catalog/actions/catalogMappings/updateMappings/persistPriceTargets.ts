import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import type Stripe from "stripe";
import {
	findMatchingStripePriceForConsumablePrice,
	findMatchingStripePriceForFixedPrice,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripePriceMatchesAutumnPrice.js";
import { listExistingStripePricesByProduct } from "./matchExistingStripeBasePrice.js";
import {
	resetStripePriceResources,
	shouldResetStripePriceResources,
} from "./resetStripePriceResources.js";
import type { PriceTarget, PriceTargets } from "./updateMappingUtils.js";

const shouldMatchExistingStripePrice = ({
	target,
}: {
	target: PriceTarget;
}) => target.matchExistingStripePrice && Boolean(target.stripeProductId);

const findMatchingStripePrice = ({
	ctx,
	target,
	stripePrices,
}: {
	ctx: AutumnContext;
	target: PriceTarget;
	stripePrices: Stripe.Price[];
}) => {
	if (!target.stripeProductId || !shouldMatchExistingStripePrice({ target })) {
		return null;
	}

	const currency = ctx.org.default_currency || "usd";
	const fixedMatch = findMatchingStripePriceForFixedPrice({
		price: target.price,
		stripeProductId: target.stripeProductId,
		stripePrices,
		currency,
	});
	if (fixedMatch) {
		return { stripePriceId: fixedMatch.id, stripeMeterId: null };
	}

	return findMatchingStripePriceForConsumablePrice({
		price: target.price,
		product: target.product,
		stripeProductId: target.stripeProductId,
		stripePrices,
		currency,
		org: ctx.org,
	});
};

export const persistPriceTargets = async ({
	ctx,
	priceTargets,
}: {
	ctx: AutumnContext;
	priceTargets: PriceTargets;
}) => {
	const { db } = ctx;
	const entries = Array.from(priceTargets.entries()).flatMap(
		([priceId, target]) =>
			shouldResetStripePriceResources({ price: target.price, target })
				? [{ priceId, target }]
				: [],
	);

	const pricesByProduct = await listExistingStripePricesByProduct({
		ctx,
		stripeProductIds: entries
			.filter((entry) => shouldMatchExistingStripePrice({ target: entry.target }))
			.flatMap((entry) =>
				entry.target.stripeProductId ? [entry.target.stripeProductId] : [],
			),
	});

	for (const { priceId, target } of entries) {
		const matchedStripePrice = findMatchingStripePrice({
			ctx,
			target,
			stripePrices: target.stripeProductId
				? (pricesByProduct.get(target.stripeProductId) ?? [])
				: [],
		});

		await PriceService.update({
			db,
			id: priceId,
			update: {
				config: resetStripePriceResources({
					price: target.price,
					target,
					stripePriceId: matchedStripePrice?.stripePriceId,
					stripeMeterId: matchedStripePrice?.stripeMeterId,
				}),
			},
		});
	}
};
