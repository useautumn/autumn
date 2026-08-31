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
		| (typeof PRICE_MAPPING_SLOTS)[number]
		| "stripe_product_id"
		| "stripe_meter_id"
		| "stripe_event_name",
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

const retrieveStripePrices = async ({
	stripeCli,
	stripePriceIds,
}: {
	stripeCli: Stripe;
	stripePriceIds: string[];
}): Promise<Map<string, Stripe.Price | undefined>> => {
	const entries = await Promise.all(
		[...new Set(stripePriceIds)].map(async (stripePriceId) => {
			const stripePrice = await getStripePrice({
				stripeClient: stripeCli,
				stripePriceId,
				expand: ["product"],
			});
			return [stripePriceId, stripePrice] as const;
		}),
	);
	return new Map(entries);
};

const meterIdOf = ({
	stripePrice,
}: {
	stripePrice: Stripe.Price;
}): string | undefined => {
	const meter = stripePrice.recurring?.meter;
	if (!meter) return undefined;
	return typeof meter === "string" ? meter : meter.id;
};

const retrieveMeters = async ({
	stripeCli,
	meterIds,
}: {
	stripeCli: Stripe;
	meterIds: string[];
}): Promise<Map<string, Stripe.Billing.Meter>> => {
	const entries = await Promise.all(
		[...new Set(meterIds)].map(async (meterId) => {
			const meter = await stripeCli.billing.meters.retrieve(meterId);
			return [meterId, meter] as const;
		}),
	);
	return new Map(entries);
};

/**
 * A metered price is bound to a Stripe meter, and usage is reported against
 * that meter's event name — so adopting the price has to adopt both, or usage
 * has nowhere to go. Derived from the price, never stated.
 */
const adoptedMeter = ({
	stripePrice,
	config,
	meters,
}: {
	stripePrice: Stripe.Price;
	config: PriceConfigIds;
	meters: Map<string, Stripe.Billing.Meter>;
}): boolean => {
	const meterId = meterIdOf({ stripePrice });
	if (!meterId || config.stripe_meter_id === meterId) return false;

	const meter = meters.get(meterId);
	if (!meter) return false;

	config.stripe_meter_id = meterId;
	config.stripe_event_name = meter.event_name;
	return true;
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
	const stripePrices = await retrieveStripePrices({
		stripeCli,
		stripePriceIds: adopted.map((entry) => entry.stripePriceId),
	});

	const meterIds: string[] = [];
	for (const entry of adopted) {
		const stripePrice = stripePrices.get(entry.stripePriceId);
		if (!stripePrice) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `Stripe price ${entry.stripePriceId} not found (plan ${entry.planId})`,
				statusCode: 400,
			});
		}

		const meterId = meterIdOf({ stripePrice });
		if (meterId && configIds({ price: entry.price }).stripe_meter_id !== meterId) {
			meterIds.push(meterId);
		}
	}

	const meters = await retrieveMeters({ stripeCli, meterIds });
	const updates: Price[] = [];

	for (const entry of adopted) {
		const stripePrice = stripePrices.get(entry.stripePriceId);
		if (!stripePrice) continue;

		// The stated price owns its product and meter: a changed price re-points
		// them, rather than leaving the row on the ones it used to belong to.
		const config = configIds({ price: entry.price });
		const stripeProductId = productIdOf({ stripePrice });
		const productChanged =
			Boolean(stripeProductId) && config.stripe_product_id !== stripeProductId;
		if (productChanged) config.stripe_product_id = stripeProductId;

		const meterChanged = adoptedMeter({ stripePrice, config, meters });
		if (!productChanged && !meterChanged) continue;

		updates.push(entry.price);
	}

	await PriceService.upsert({ db: ctx.db, data: updates });
};
