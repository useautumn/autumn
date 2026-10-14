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

export const applyMeterDecision = async ({
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

export const productIdOf = ({
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

export const validateAdoptedStripePrices = async ({
	ctx,
	upsertProducts,
}: {
	ctx: AutumnContext;
	upsertProducts: UpsertProductPlan[];
}) => {
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

		const config = configIds({ price: entry.price });
		const stripeProductId = productIdOf({ stripePrice });
		const productChanged =
			Boolean(stripeProductId) && config.stripe_product_id !== stripeProductId;
		if (productChanged) config.stripe_product_id = stripeProductId;

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
