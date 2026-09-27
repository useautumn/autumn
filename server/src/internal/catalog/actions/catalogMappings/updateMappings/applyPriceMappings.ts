import {
	type CatalogUpdateMappingsParams,
	ErrCode,
	type FullProduct,
	isPrepaidPrice,
	type Price,
	priceToFeature,
	RecaseError,
	type StripePriceMappingSlot,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyMeterDecision,
	meterDecision,
	priceRequiresMeter,
	productIdOf,
} from "@/internal/catalogV2/execute/executeInitStripeResources/validateAdoptedStripePrices.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { clearDependentStripePriceFields } from "../catalogMappingUtils.js";
import { createMappingStripeProduct } from "./createMappingStripeProduct.js";
import { normalizeStripeProductId } from "./updateMappingUtils.js";

type PriceMapping = CatalogUpdateMappingsParams["price_mappings"][number];

type MappedPrice = { price: Price; product: FullProduct };

type StripeIdConfig = Record<string, string | null | undefined>;

/** Prepaid bills from the v2 slot, everything else from v1. */
const stripePriceSlot = ({
	price,
}: {
	price: Price;
}): StripePriceMappingSlot =>
	isPrepaidPrice(price) ? "stripe_prepaid_price_v2_id" : "stripe_price_id";

const currentStripePriceId = ({ price }: { price: Price }) =>
	(price.config as unknown as StripeIdConfig)[stripePriceSlot({ price })] ??
	null;

const indexPricesById = ({ products }: { products: FullProduct[] }) => {
	const pricesById = new Map<string, MappedPrice>();
	for (const product of products) {
		for (const price of product.prices ?? []) {
			pricesById.set(price.id, { price, product });
		}
	}
	return pricesById;
};

const findMappedPrice = ({
	pricesById,
	priceId,
}: {
	pricesById: Map<string, MappedPrice>;
	priceId: string;
}) => {
	const mapped = pricesById.get(priceId);
	if (mapped) return mapped;

	throw new RecaseError({
		message: `Price ${priceId} not found`,
		code: ErrCode.PriceNotFound,
		statusCode: 404,
	});
};

const isUnchanged = ({
	price,
	stripeProductId,
	stripePriceId,
}: {
	price: Price;
	stripeProductId: string | null;
	stripePriceId: string | null;
}) =>
	(price.config.stripe_product_id ?? null) === stripeProductId &&
	currentStripePriceId({ price }) === stripePriceId;

/** A stated Stripe price must exist, sit under the stated product, and carry a meter if usage needs one. */
const fetchAdoptableStripePrice = async ({
	stripeCli,
	mapped,
	stripeProductId,
	stripePriceId,
}: {
	stripeCli: Stripe;
	mapped: MappedPrice;
	stripeProductId: string | null;
	stripePriceId: string;
}) => {
	const stripePrice = await getStripePrice({
		stripeClient: stripeCli,
		stripePriceId,
		expand: ["product"],
	});
	if (!stripePrice) {
		throw new RecaseError({
			message: `Stripe price ${stripePriceId} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const owningProductId = productIdOf({ stripePrice });
	if (owningProductId !== stripeProductId) {
		throw new RecaseError({
			message: `Stripe price ${stripePriceId} belongs to product ${owningProductId}, not ${stripeProductId}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (!stripePrice.recurring?.meter && priceRequiresMeter(mapped)) {
		throw new RecaseError({
			message: `Stripe price ${stripePriceId} has no meter, so it cannot bill a usage-based price`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return stripePrice;
};

/** Named like Autumn's own per-plan products, e.g. "Pro - Messages". */
const newStripeProductName = ({
	ctx,
	mapped,
}: {
	ctx: AutumnContext;
	mapped: MappedPrice;
}) => {
	const feature = priceToFeature({
		price: mapped.price,
		features: ctx.features,
	});
	return feature
		? `${mapped.product.name} - ${feature.name}`
		: mapped.product.name;
};

type AdoptedStripePrices = Map<string, Stripe.Price>;

const buildMappedPriceConfig = async ({
	stripeCli,
	mapped,
	stripeProductId,
	stripePrice,
}: {
	stripeCli: Stripe | null;
	mapped: MappedPrice;
	stripeProductId: string | null;
	stripePrice: Stripe.Price | undefined;
}) => {
	const config = clearDependentStripePriceFields({
		price: mapped.price,
		stripeProductId,
	});
	if (!stripePrice || !stripeCli) return config;

	const slotConfig = config as unknown as StripeIdConfig;
	slotConfig[stripePriceSlot({ price: mapped.price })] = stripePrice.id;
	await applyMeterDecision({
		stripeCli,
		decision: meterDecision({ stripePrice, config: slotConfig }),
		config: slotConfig,
	});

	return config;
};

const stripeCliForMappings = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
}) =>
	params.price_mappings.some((mapping: PriceMapping) => mapping.stripe_price_id)
		? createStripeCli({ org: ctx.org, env: ctx.env })
		: null;

/** Rejects a bad price mapping before any mapping write lands; returns the Stripe prices to adopt. */
export const validatePriceMappings = async ({
	ctx,
	params,
	products,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
	products: FullProduct[];
}): Promise<AdoptedStripePrices> => {
	const adopted: AdoptedStripePrices = new Map();
	const pricesById = indexPricesById({ products });
	const stripeCli = stripeCliForMappings({ ctx, params });

	for (const mapping of params.price_mappings) {
		const mapped = findMappedPrice({ pricesById, priceId: mapping.price_id });
		const stripePriceId = mapping.stripe_price_id?.trim() || null;
		if (!stripePriceId || !stripeCli) continue;
		if (mapping.create_stripe_product) {
			throw new RecaseError({
				message: `Price ${mapping.price_id} can't use Stripe price ${stripePriceId} on a new Stripe product`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const stripeProductId = normalizeStripeProductId(mapping.stripe_product_id);
		if (!stripeProductId) {
			throw new RecaseError({
				message: `Price ${mapping.price_id} needs a Stripe product to use Stripe price ${stripePriceId}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		adopted.set(
			mapping.price_id,
			await fetchAdoptableStripePrice({
				stripeCli,
				mapped,
				stripeProductId,
				stripePriceId,
			}),
		);
	}
	return adopted;
};

export const applyPriceMappings = async ({
	ctx,
	params,
	products,
	adoptedStripePrices,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
	products: FullProduct[];
	adoptedStripePrices: AdoptedStripePrices;
}) => {
	if (params.price_mappings.length === 0) return;

	const pricesById = indexPricesById({ products });
	const stripeCli = stripeCliForMappings({ ctx, params });

	for (const mapping of params.price_mappings) {
		const mapped = findMappedPrice({ pricesById, priceId: mapping.price_id });
		const stripeProductId = mapping.create_stripe_product
			? await createMappingStripeProduct({
					ctx,
					name: newStripeProductName({ ctx, mapped }),
				})
			: normalizeStripeProductId(mapping.stripe_product_id);
		const stripePriceId = mapping.stripe_price_id?.trim() || null;
		if (isUnchanged({ price: mapped.price, stripeProductId, stripePriceId })) {
			continue;
		}

		await PriceService.update({
			db: ctx.db,
			id: mapped.price.id,
			update: {
				config: await buildMappedPriceConfig({
					stripeCli,
					mapped,
					stripeProductId,
					stripePrice: adoptedStripePrices.get(mapping.price_id),
				}),
			},
		});
	}
};
