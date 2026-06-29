import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	findMatchingStripePriceForFixedPrice,
	listExistingStripePricesByProduct,
} from "./matchExistingStripeBasePrice.js";
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
		const matchedStripePrice =
			target.stripeProductId && shouldMatchExistingStripePrice({ target })
				? findMatchingStripePriceForFixedPrice({
						price: target.price,
						stripeProductId: target.stripeProductId,
						stripePrices: pricesByProduct.get(target.stripeProductId) ?? [],
						currency: ctx.org.default_currency || "usd",
					})
				: undefined;

		await PriceService.update({
			db,
			id: priceId,
			update: {
				config: resetStripePriceResources({
					price: target.price,
					target,
					stripePriceId: matchedStripePrice?.id,
				}),
			},
		});
	}
};
