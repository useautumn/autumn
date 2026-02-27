import {
	cusEntToBillingObjects,
	type FullCusEntWithFullCusProduct,
	featureOptionUtils,
	InternalError,
	isPrepaidPrice,
	type StripeItemSpec,
	type UsagePriceConfig,
} from "@autumn/shared";
import { notNullish } from "@server/utils/genUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusEntToInlineStripePrice } from "./cusEntToInlineStripePrice";

/**
 * Converts a prepaid (usage-in-advance) price to a StripeItemSpec.
 * For entity-scoped products, uses an inline price so each entity gets unique tiers.
 * For non-entity-scoped, uses the stored stripe_prepaid_price_v2_id.
 */
export const prepaidToStripeItemSpec = ({
	ctx,
	cusEntWithCusProduct,
}: {
	ctx: AutumnContext;
	cusEntWithCusProduct: FullCusEntWithFullCusProduct;
}): StripeItemSpec | null => {
	const billing = cusEntToBillingObjects({ cusEnt: cusEntWithCusProduct });
	if (!billing) return null;

	const { cusProduct, price, product, entitlement, options } = billing;

	if (!isPrepaidPrice(price)) {
		throw new InternalError({
			message: `[prepaidToStripeItemSpec] Price ${price.id} is not a prepaid price`,
		});
	}

	const config = price.config as UsagePriceConfig;
	const isEntityScoped = notNullish(cusProduct.internal_entity_id);

	if (isEntityScoped) {
		const inlinePrice = cusEntToInlineStripePrice({
			cusEnt: cusEntWithCusProduct,
			org: ctx.org,
		});

		return {
			stripeInlinePrice: inlinePrice,
			quantity: 1,
			autumnPrice: price,
			autumnEntitlement: entitlement,
			autumnProduct: product,
			autumnCusEnt: cusEntWithCusProduct,
		};
	}

	const quantity = featureOptionUtils.convert.toV2StripeQuantity({
		featureOptions: options ?? undefined,
		price,
		entitlement,
	});

	return {
		stripePriceId: config.stripe_prepaid_price_v2_id!,
		quantity,
		autumnPrice: price,
		autumnEntitlement: entitlement,
		autumnProduct: product,
		autumnCusEnt: cusEntWithCusProduct,
	};
};
