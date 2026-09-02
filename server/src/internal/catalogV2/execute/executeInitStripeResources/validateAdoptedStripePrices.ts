import {
	ErrCode,
	type FullProduct,
	type Price,
	priceToRequiredStripeSlots,
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

type AdoptedPrice = {
	planId: string;
	price: Price;
	product: FullProduct;
	stripePriceId: string;
	slot: (typeof PRICE_MAPPING_SLOTS)[number];
};

const configIds = ({ price }: { price: Price }): PriceConfigIds =>
	(price.config ?? {}) as PriceConfigIds;

/**
 * What each existing price row holds, per slot. Keyed by price id so an id
 * MOVED from one row to another still counts as newly stated on the row that
 * now claims it — a product-wide set would wave that through and leave the
 * destination row pointing at the wrong Stripe product.
 */
const currentSlotIdsByPriceId = ({
	product,
}: {
	product: FullProduct | null | undefined;
}): Map<string, PriceConfigIds> => {
	const byPriceId = new Map<string, PriceConfigIds>();
	for (const price of product?.prices ?? []) {
		if (price.id) byPriceId.set(price.id, configIds({ price }));
	}
	return byPriceId;
};

/**
 * A mint clones the previous row's prices under fresh price ids, so per-row
 * matching cannot see them. Those ids were real when Autumn wrote them, so the
 * cloned-from row stays a product-wide exemption.
 */
const mintedStripePriceIds = ({
	product,
}: {
	product: FullProduct | null | undefined;
}): Set<string> =>
	new Set(
		(product?.prices ?? []).flatMap((price) =>
			PRICE_MAPPING_SLOTS.map((slot) => configIds({ price })[slot]).filter(
				(id): id is string => Boolean(id),
			),
		),
	);

/**
 * Stated ids only — an id Autumn minted earlier was real when it was written.
 * Emits one entry per newly-supplied SLOT: a price can state both an internal
 * `stripe_price_id` and a `processors` id, and validating only the first would
 * let the other through unchecked.
 */
export const newlyAdoptedPrices = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): AdoptedPrice[] => {
	const next: FullProduct = upsert.row.nextFullProduct;
	const currentByPriceId = currentSlotIdsByPriceId({
		product: upsert.row.currentFullProduct,
	});
	const minted = mintedStripePriceIds({ product: upsert.row.baseFullProduct });

	return next.prices.flatMap((price) => {
		const ids = configIds({ price });
		const current =
			(price.id ? currentByPriceId.get(price.id) : undefined) ?? {};
		return PRICE_MAPPING_SLOTS.flatMap((slot) => {
			const stripePriceId = ids[slot];
			if (!stripePriceId) return [];
			if (stripePriceId === current[slot]) return [];
			if (minted.has(stripePriceId)) return [];
			return [{ planId: next.id, price, product: next, stripePriceId, slot }];
		});
	});
};

/** Usage-based prices bill through a meter, so an adopted price must carry one. */
export const priceRequiresMeter = ({
	price,
	product,
}: {
	price: Price;
	product: FullProduct;
}): boolean =>
	priceToRequiredStripeSlots({ price, product }).includes("stripe_meter_id");

export type MeterDecision =
	| { type: "unchanged" }
	| { type: "clear" }
	| { type: "adopt"; meterId: string };

/**
 * A metered price is bound to a Stripe meter, and usage is reported against
 * that meter's event name — so adopting the price has to adopt both, or usage
 * has nowhere to go. Derived from the price, never stated. Re-mapping onto a
 * price with NO meter has to clear the old one, or usage keeps reporting to a
 * meter the plan no longer bills through.
 */
export const meterDecision = ({
	stripePrice,
	config,
}: {
	stripePrice: Pick<Stripe.Price, "recurring">;
	config: PriceConfigIds;
}): MeterDecision => {
	const meterId = stripePrice.recurring?.meter;
	if (!meterId) {
		return config.stripe_meter_id || config.stripe_event_name
			? { type: "clear" }
			: { type: "unchanged" };
	}
	if (config.stripe_meter_id === meterId) return { type: "unchanged" };
	return { type: "adopt", meterId };
};

const applyMeterDecision = async ({
	stripeCli,
	decision,
	config,
}: {
	stripeCli: Stripe;
	decision: MeterDecision;
	config: PriceConfigIds;
}): Promise<boolean> => {
	if (decision.type === "unchanged") return false;
	if (decision.type === "clear") {
		config.stripe_meter_id = null;
		config.stripe_event_name = null;
		return true;
	}
	const meter = await stripeCli.billing.meters.retrieve(decision.meterId);
	config.stripe_meter_id = decision.meterId;
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

		// The stated price owns its product and meter: a changed price re-points
		// them, rather than leaving the row on the ones it used to belong to.
		const config = configIds({ price: entry.price });
		const stripeProductId = productIdOf({ stripePrice });
		const productChanged =
			Boolean(stripeProductId) && config.stripe_product_id !== stripeProductId;
		if (productChanged) config.stripe_product_id = stripeProductId;

		// A usage item bills through the meter bound to its price. Adopting a
		// meterless price would leave the meter slot unfillable — init re-runs
		// forever and `createStripeInArrearPrice` returns early on the existing
		// price — so the item could never report usage. Reject it up front.
		if (
			!stripePrice.recurring?.meter &&
			priceRequiresMeter({ price: entry.price, product: entry.product })
		) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				message: `Stripe price ${entry.stripePriceId} has no meter, so it cannot bill a usage-based item (plan ${entry.planId})`,
				statusCode: 400,
			});
		}

		const meterChanged = await applyMeterDecision({
			stripeCli,
			decision: meterDecision({ stripePrice, config }),
			config,
		});
		if (!productChanged && !meterChanged) continue;

		await PriceService.update({
			db: ctx.db,
			id: entry.price.id!,
			update: { config: entry.price.config },
		});
	}
};
