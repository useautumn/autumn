import {
	CatalogUpdateMappingsParams,
	CatalogUpdateMappingsResponse,
	ErrCode,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { invalidateProductsCache } from "@/internal/products/productCacheUtils.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	type PriceConfigWithStripe,
	buildProductMappingContext,
	clearDependentStripePriceFields,
} from "./catalogMappingUtils.js";
import { getCatalogMappings } from "./getCatalogMappings.js";
import { matchesPlanItemFilter } from "@utils/productV2Utils/productItemUtils/matchPlanItem.js";

const normalizeStripeProductId = (stripeProductId: string | null) =>
	stripeProductId?.trim() ? stripeProductId.trim() : null;

const assertUniquePlanMappings = ({
	params,
}: {
	params: CatalogUpdateMappingsParams;
}) => {
	const seen = new Map<string, string>();

	for (const mapping of params.plan_mappings) {
		const signature = JSON.stringify({
			stripe_product_id: normalizeStripeProductId(mapping.stripe_product_id),
			apply_to_prices: mapping.apply_to_prices,
		});
		const existing = seen.get(mapping.plan_id);
		if (existing && existing !== signature) {
			throw new RecaseError({
				message: `Conflicting plan mappings for ${mapping.plan_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		seen.set(mapping.plan_id, signature);
	}
};

const setPriceTarget = ({
	targets,
	priceId,
	stripeProductId,
	source,
}: {
	targets: Map<string, { stripeProductId: string | null; source: "plan" | "item" }>;
	priceId: string;
	stripeProductId: string | null;
	source: "plan" | "item";
}) => {
	const existing = targets.get(priceId);
	if (!existing) {
		targets.set(priceId, { stripeProductId, source });
		return;
	}

	if (existing.stripeProductId === stripeProductId) return;
	if (existing.source === "plan" && source === "item") {
		targets.set(priceId, { stripeProductId, source });
		return;
	}

	throw new RecaseError({
		message: `Conflicting item mappings target the same price`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const updateCatalogMappings = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CatalogUpdateMappingsParams;
}): Promise<CatalogUpdateMappingsResponse> => {
	const { db, org, env, features } = ctx;
	assertUniquePlanMappings({ params });

	const planIds = [
		...new Set([
			...params.plan_mappings.map((mapping) => mapping.plan_id),
			...params.item_mappings.map((mapping) => mapping.plan_id),
		]),
	];

	if (planIds.length === 0) {
		return getCatalogMappings({ ctx, params });
	}

	const products = await ProductService.listFull({
		db,
		orgId: org.id,
		env,
		inIds: planIds,
		returnAll: true,
	});

	const productsByPlanId = new Map(
		planIds.map((planId) => [
			planId,
			products.filter((product) => product.id === planId),
		]),
	);

	for (const [planId, planProducts] of productsByPlanId.entries()) {
		if (planProducts.length > 0) continue;
		throw new RecaseError({
			message: `Plan ${planId} not found`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	const contextsByPlanId = new Map(
		planIds.map((planId) => [
			planId,
			(productsByPlanId.get(planId) ?? []).map((product) =>
				buildProductMappingContext({
					product,
					features,
					currency: org.default_currency || "usd",
				}),
			),
		]),
	);

	const priceTargets = new Map<
		string,
		{ stripeProductId: string | null; source: "plan" | "item" }
	>();

	for (const mapping of params.plan_mappings) {
		const stripeProductId = normalizeStripeProductId(mapping.stripe_product_id);
		const contexts = contextsByPlanId.get(mapping.plan_id) ?? [];

		for (const context of contexts) {
			await ProductService.updateByInternalId({
				db,
				internalId: context.product.internal_id,
				update: {
					processor: stripeProductId
						? { id: stripeProductId, type: ProcessorType.Stripe }
						: null,
				},
			});

			if (mapping.apply_to_prices === "none") continue;
			if (
				mapping.apply_to_prices === "base_price" &&
				context.basePrice?.id
			) {
				setPriceTarget({
					targets: priceTargets,
					priceId: context.basePrice.id,
					stripeProductId,
					source: "plan",
				});
				continue;
			}

			if (mapping.apply_to_prices === "all_prices") {
				for (const price of context.product.prices) {
					setPriceTarget({
						targets: priceTargets,
						priceId: price.id,
						stripeProductId,
						source: "plan",
					});
				}
			}
		}
	}

	for (const mapping of params.item_mappings) {
		const stripeProductId = normalizeStripeProductId(mapping.stripe_product_id);
		const contexts = contextsByPlanId.get(mapping.plan_id) ?? [];
		let matchedCount = 0;

		for (const context of contexts) {
			for (const entry of context.itemPrices) {
				if (
					!matchesPlanItemFilter({
						item: entry.item,
						filter: mapping.item,
					})
				) {
					continue;
				}
				matchedCount++;
				setPriceTarget({
					targets: priceTargets,
					priceId: entry.price.id,
					stripeProductId,
					source: "item",
				});
			}
		}

		if (matchedCount === 0) {
			throw new RecaseError({
				message: `No price-backed items matched filter for plan ${mapping.plan_id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	for (const [priceId, target] of priceTargets.entries()) {
		const price = await PriceService.get({ db, id: priceId });
		const config = price.config as PriceConfigWithStripe;
		const currentStripeProductId = config.stripe_product_id ?? null;
		if (currentStripeProductId === target.stripeProductId) continue;

		await PriceService.update({
			db,
			id: priceId,
			update: {
				config: clearDependentStripePriceFields({
					config,
					stripeProductId: target.stripeProductId,
				}),
			},
		});
	}

	await invalidateProductsCache({ orgId: org.id, env });

	return getCatalogMappings({ ctx, params });
};
