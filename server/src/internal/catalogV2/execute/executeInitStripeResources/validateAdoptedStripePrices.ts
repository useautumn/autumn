import {
	ErrCode,
	type FullProduct,
	type Price,
	RecaseError,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

type AdoptedPrice = { planId: string; priceId: string; stripePriceId: string };

const adoptedStripePriceId = ({ price }: { price: Price }): string | null =>
	(price.config as { stripe_prepaid_price_v2_id?: string | null })
		?.stripe_prepaid_price_v2_id ?? null;

/** Stated ids only — an id Autumn minted earlier was real when it was written. */
const newlyAdoptedPrices = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): AdoptedPrice[] => {
	const next: FullProduct = upsert.row.nextFullProduct;
	const current = upsert.row.currentFullProduct;

	return next.prices.flatMap((price) => {
		const stripePriceId = adoptedStripePriceId({ price });
		if (!stripePriceId) return [];

		const currentPrice = current?.prices.find(
			(candidate) => candidate.id === price.id,
		);
		if (
			currentPrice &&
			adoptedStripePriceId({ price: currentPrice }) === stripePriceId
		) {
			return [];
		}
		return [{ planId: next.id, priceId: price.id, stripePriceId }];
	});
};

/**
 * A stated Stripe price must already exist. Autumn never mints a replacement
 * for one — that would hand back an id the caller never asked for.
 */
export const validateAdoptedStripePrices = async ({
	ctx,
	upsertProducts,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
}) => {
	const adopted = upsertProducts.flatMap((upsert) =>
		newlyAdoptedPrices({ upsert }),
	);
	if (adopted.length === 0) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const seen = new Map<string, boolean>();

	for (const entry of adopted) {
		const cached = seen.get(entry.stripePriceId);
		const exists =
			cached ??
			Boolean(
				await getStripePrice({
					stripeClient: stripeCli,
					stripePriceId: entry.stripePriceId,
				}),
			);
		seen.set(entry.stripePriceId, exists);

		if (!exists) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `Stripe price ${entry.stripePriceId} (plan ${entry.planId}) does not exist. Autumn will not create a replacement — check the id or omit it.`,
				statusCode: 400,
			});
		}
	}
};
