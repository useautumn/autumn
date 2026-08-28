import {
	ErrCode,
	type FullProduct,
	type Price,
	RecaseError,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { PriceService } from "@/internal/products/prices/PriceService";

/** Fixed prices bill from the v1 slot, prepaid from the v2 slot. */
const PRICE_MAPPING_SLOTS = [
	"stripe_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

type PriceConfigIds = Partial<
	Record<
		(typeof PRICE_MAPPING_SLOTS)[number] | "stripe_product_id",
		string | null
	>
>;

type AdoptedPrice = { planId: string; price: Price; stripePriceId: string };

const configIds = ({ price }: { price: Price }): PriceConfigIds =>
	(price.config ?? {}) as PriceConfigIds;

/**
 * Every Stripe price this row already had, plus the row it was cloned from —
 * an id carried forward by a mint was real when Autumn wrote it.
 */
const knownStripePriceIds = ({
	products,
}: {
	products: Array<FullProduct | null | undefined>;
}): Set<string> =>
	new Set(
		products.flatMap((product) =>
			(product?.prices ?? []).flatMap((price) =>
				PRICE_MAPPING_SLOTS.map((slot) => configIds({ price })[slot]).filter(
					(id): id is string => Boolean(id),
				),
			),
		),
	);

/** Stated ids only — an id Autumn minted earlier was real when it was written. */
const newlyAdoptedPrices = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): AdoptedPrice[] => {
	const next: FullProduct = upsert.row.nextFullProduct;
	const known = knownStripePriceIds({
		products: [upsert.row.currentFullProduct, upsert.row.baseFullProduct],
	});

	return next.prices.flatMap((price) => {
		const ids = configIds({ price });
		const stripePriceId = PRICE_MAPPING_SLOTS.map((slot) => ids[slot])
			.filter((id): id is string => Boolean(id))
			.find((id) => !known.has(id));
		if (!stripePriceId) return [];
		return [{ planId: next.id, price, stripePriceId }];
	});
};

/** Expanded prices carry the product object; unexpanded ones carry its id. */
const productIdOf = ({
	stripePrice,
}: {
	stripePrice: Stripe.Price;
}): string | null => {
	const product = stripePrice.product;
	if (!product) return null;
	if (typeof product === "string") return product;
	if ("deleted" in product && product.deleted) return null;
	return product.id;
};

/**
 * A stated Stripe price must already exist — Autumn never mints a replacement,
 * which would hand back an id the caller never asked for. The same lookup
 * records the price's own Stripe product, so adoption never leaves a price
 * pointing at a product it does not belong to.
 *
 * Scoped to prices this request stated: shared init paths (attach, sync,
 * migrations) are untouched.
 */
export const validateAdoptedStripePrices = async ({
	ctx,
	upsertProducts,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
}) => {
	// `create_in_stripe: false` means this plan does not talk to Stripe at all,
	// so its ids are threaded through rather than resolved.
	const adopted = upsertProducts
		.filter((upsert) => upsert.createInStripe !== false)
		.flatMap((upsert) => newlyAdoptedPrices({ upsert }));
	if (adopted.length === 0) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const seen = new Map<string, Stripe.Price | undefined>();

	for (const entry of adopted) {
		const stripePrice = seen.has(entry.stripePriceId)
			? seen.get(entry.stripePriceId)
			: await getStripePrice({
					stripeClient: stripeCli,
					stripePriceId: entry.stripePriceId,
					expand: ["product"],
				});
		seen.set(entry.stripePriceId, stripePrice);

		if (!stripePrice) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `Stripe price ${entry.stripePriceId} not found (plan ${entry.planId})`,
				statusCode: 400,
			});
		}

		// The stated price owns its product: a changed price re-points it,
		// rather than leaving the row on the product it used to belong to.
		const stripeProductId = productIdOf({ stripePrice });
		if (!stripeProductId) continue;

		const config = configIds({ price: entry.price });
		if (config.stripe_product_id === stripeProductId) continue;

		config.stripe_product_id = stripeProductId;
		await PriceService.update({
			db: ctx.db,
			id: entry.price.id!,
			update: { config: entry.price.config },
		});
	}
};
