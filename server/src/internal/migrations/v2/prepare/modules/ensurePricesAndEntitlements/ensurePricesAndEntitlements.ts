import {
	copyStripeResourcesToMatchingPrice,
	type Entitlement,
	findFeatureById,
	type FullProduct,
	type Price,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { planFilterMatchesProduct } from "@autumn/shared/api/products/utils/match/index.js";
import { basePriceToProductItem } from "@autumn/shared/api/products/components/basePrice/basePriceToProductItem.js";
import { planItemV1ToPriceAndEnt } from "@autumn/shared/api/products/items/mappers/planItemV1ToPriceAndEnt.js";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { itemToPriceAndEnt } from "@autumn/shared/utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { applyStripeResourceReuseForProduct } from "@/internal/products/stripeResourceUtils/applyStripeResourceReuseForProduct.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import type { PrepareModule } from "../../types/prepareModule.js";
import type {
	EnsurePricesAndEntitlementsResult,
	PreparedArtifactRef,
} from "./types.js";

export type EnsurePricesAndEntitlementsInput = {
	updatePlanOps: {
		opIndex: number;
		op: UpdatePlanOp;
	}[];
};

const artifactHash = ({ value }: { value: unknown }) => hashJson({ value });

const preparedRowId = ({
	prefix,
	value,
}: {
	prefix: "ent" | "pr";
	value: unknown;
}) => `${prefix}_${hashJson({ value })}`;

export const basePriceIdFor = ({
	scopeId,
	opIndex,
	internalProductId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	internalProductId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "pr",
		value: { scopeId, opIndex, internalProductId, kind: "base_price", hash },
	});

export const priceIdFor = ({
	scopeId,
	opIndex,
	itemIndex,
	internalFeatureId,
	internalProductId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	itemIndex: number;
	internalFeatureId: string;
	internalProductId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "pr",
		value: {
			scopeId,
			opIndex,
			itemIndex,
			internalFeatureId,
			internalProductId,
			kind: "add_item",
			hash,
		},
	});

export const entitlementIdFor = ({
	scopeId,
	opIndex,
	itemIndex,
	internalFeatureId,
	internalProductId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	itemIndex: number;
	internalFeatureId: string;
	internalProductId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "ent",
		value: {
			scopeId,
			opIndex,
			itemIndex,
			internalFeatureId,
			internalProductId,
			kind: "add_item",
			hash,
		},
	});

const getMatchedProducts = async ({
	ctx,
	op,
}: {
	ctx: AutumnContext;
	op: UpdatePlanOp;
}) => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});

	return products.filter((product) =>
		planFilterMatchesProduct({
			filter: op.plan_filter,
			product,
		}),
	);
};

/**
 * Anchors Stripe resource reuse to the LATEST version of the BASE plan
 * (`product.base_variant_id ?? product.id` — so a yearly variant like
 * `pro_yearly` reuses `pro`'s price, not its own separate history) — not
 * "whichever sibling this run happens to prepare first". Looks up the base
 * plan's own catalog data directly (not the current op's `matchedProducts`,
 * which is scoped to just this op's `plan_filter` and won't include a
 * different plan_id's rows) via a dedicated, cached-per-call query, and only
 * ever reuses its NON-CUSTOM price — the one created by ordinary catalog
 * editing, never a prior migration run's own synthesized custom price — so a
 * re-run of the same migration finds the real Stripe ids that catalog price
 * already carries, before this run's own upsert would otherwise blank a
 * fresh synthesized price back out. Mutates `price.config` in place; no DB
 * writes (safe to call from `.plan()`, which also runs during dry runs).
 */
const inheritStripeResourcesFromLatestVersion = async ({
	ctx,
	price,
	entitlement,
	product,
	basePlanVersionsCache,
}: {
	ctx: AutumnContext;
	price: Price;
	entitlement: Entitlement | undefined;
	product: FullProduct;
	basePlanVersionsCache: Map<string, Promise<FullProduct[]>>;
}) => {
	const featureId = price.config.feature_id;
	if (!featureId) return;

	const basePlanId = product.base_variant_id ?? product.id;

	let basePlanVersionsPromise = basePlanVersionsCache.get(basePlanId);
	if (!basePlanVersionsPromise) {
		basePlanVersionsPromise = ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			returnAll: true,
			inIds: [basePlanId],
		});
		basePlanVersionsCache.set(basePlanId, basePlanVersionsPromise);
	}
	const basePlanVersions = await basePlanVersionsPromise;
	if (basePlanVersions.length === 0) return;

	const latestVersionProduct = basePlanVersions.reduce((latest, candidate) =>
		candidate.version > latest.version ? candidate : latest,
	);

	// A feature can have more than one price (e.g. AI_CREDITS carries both a
	// prepaid tiered price and a metered pay-as-you-go price) — pass every
	// same-feature candidate and let copyStripeResourcesToMatchingPrice's own
	// content matching (pricesAreSame) pick the right one, rather than picking
	// just the first `find()` hit and having no fallback if it's the wrong one.
	const candidatePrices = latestVersionProduct.prices.filter(
		(candidate) => candidate.config.feature_id === featureId,
	);
	if (candidatePrices.length === 0) return;

	copyStripeResourcesToMatchingPrice({
		targetPrice: price,
		candidatePrices,
		targetEntitlements: entitlement ? [entitlement] : [],
		candidateEntitlements: latestVersionProduct.entitlements,
	});
};

const buildProductsWithPreparedRows = ({
	products,
	prices,
	entitlements,
	features,
}: {
	products: FullProduct[];
	prices: Price[];
	entitlements: Entitlement[];
	features: Parameters<typeof enrichEntitlementsWithFeatures>[0]["features"];
}): FullProduct[] => {
	const productsByInternalId = new Map(
		products.map((product) => [product.internal_id, product]),
	);
	const preparedProductIds = new Set([
		...prices
			.map((price) => price.internal_product_id)
			.filter((id): id is string => Boolean(id)),
		...entitlements
			.map((entitlement) => entitlement.internal_product_id)
			.filter((id): id is string => Boolean(id)),
	]);

	return Array.from(preparedProductIds).map((internalProductId) => {
		const product = productsByInternalId.get(internalProductId);
		if (!product) {
			throw new Error(
				`ensurePricesAndEntitlements: product ${internalProductId} not found for prepared rows`,
			);
		}

		return {
			...product,
			prices: prices.filter(
				(price) => price.internal_product_id === internalProductId,
			),
			entitlements: enrichEntitlementsWithFeatures({
				entitlements: entitlements.filter(
					(entitlement) =>
						entitlement.internal_product_id === internalProductId,
				),
				features,
			}),
		};
	});
};

export const ensurePricesAndEntitlements: PrepareModule<
	EnsurePricesAndEntitlementsInput,
	EnsurePricesAndEntitlementsResult
> = {
	kind: "ensure_prices_and_entitlements",

	async plan({ ctx, scopeId, input }) {
		const entitlementsById = new Map<string, Entitlement>();
		const pricesById = new Map<string, Price>();
		const artifacts: PreparedArtifactRef[] = [];
		const basePlanVersionsCache = new Map<string, Promise<FullProduct[]>>();

		for (const { opIndex, op } of input.updatePlanOps) {
			const customize = op.customize;
			if (!customize) continue;
			const matchedProducts = await getMatchedProducts({ ctx, op });

			for (const product of matchedProducts) {
				if (customize.price) {
					const hash = artifactHash({ value: customize.price });
					const priceId = basePriceIdFor({
						scopeId,
						opIndex,
						internalProductId: product.internal_id,
						hash,
					});
					const item = basePriceToProductItem({
						ctx,
						basePrice: customize.price,
					});
					const { newPrice, updatedPrice } = itemToPriceAndEnt({
						item,
						orgId: ctx.org.id,
						internalProductId: product.internal_id,
						isCustom: true,
						features: ctx.features,
					});
					const price = newPrice ?? updatedPrice;

					if (price) {
						pricesById.set(priceId, {
							...price,
							id: priceId,
							internal_product_id: product.internal_id,
						});
						artifacts.push({
							op_index: opIndex,
							kind: "base_price",
							internal_product_id: product.internal_id,
							hash,
							price_id: priceId,
						});
					}
				}

				for (const [itemIndex, item] of (customize.add_items ?? []).entries()) {
					const feature = findFeatureById({
						features: ctx.features,
						featureId: item.feature_id,
						errorOnNotFound: true,
					});
					const hash = artifactHash({ value: item });
					const entitlementId = entitlementIdFor({
						scopeId,
						opIndex,
						itemIndex,
						internalFeatureId: feature.internal_id,
						internalProductId: product.internal_id,
						hash,
					});
					const priceId = priceIdFor({
						scopeId,
						opIndex,
						itemIndex,
						internalFeatureId: feature.internal_id,
						internalProductId: product.internal_id,
						hash,
					});

					const { newEnt, newPrice } = planItemV1ToPriceAndEnt({
						ctx,
						item,
						orgId: ctx.org.id,
						internalProductId: product.internal_id,
						isCustom: true,
					});

					if (newEnt) {
						entitlementsById.set(entitlementId, {
							...newEnt,
							id: entitlementId,
							internal_product_id: product.internal_id,
						});
					}
					if (newPrice) {
						const preparedPrice: Price = {
							...newPrice,
							id: priceId,
							entitlement_id: newEnt ? entitlementId : newPrice.entitlement_id,
							internal_product_id: product.internal_id,
						};

						await inheritStripeResourcesFromLatestVersion({
							ctx,
							price: preparedPrice,
							entitlement: newEnt
								? { ...newEnt, id: entitlementId, internal_product_id: product.internal_id }
								: undefined,
							product,
							basePlanVersionsCache,
						});

						pricesById.set(priceId, preparedPrice);
					}

					artifacts.push({
						op_index: opIndex,
						kind: "add_item",
						item_index: itemIndex,
						internal_product_id: product.internal_id,
						hash,
						...(newPrice ? { price_id: priceId } : {}),
						...(newEnt ? { entitlement_id: entitlementId } : {}),
					});
				}
			}
		}

		return {
			entitlements: Array.from(entitlementsById.values()),
			prices: Array.from(pricesById.values()),
			artifacts,
		};
	},

	async apply({ ctx, planned, input }) {
		if (planned.entitlements.length > 0) {
			await EntitlementService.upsert({
				db: ctx.db,
				data: planned.entitlements,
			});
		}
		if (planned.prices.length > 0) {
			await PriceService.upsert({ db: ctx.db, data: planned.prices });
			const allMatchedProducts = (
				await Promise.all(
					input.updatePlanOps.map(({ op }) => getMatchedProducts({ ctx, op })),
				)
			).flat();
			const productsWithPreparedRows = buildProductsWithPreparedRows({
				products: allMatchedProducts,
				prices: planned.prices,
				entitlements: planned.entitlements,
				features: ctx.features,
			});

			// Every matched product version starts this call with an identical,
			// brand-new synthesized price — none of them has a real Stripe id yet,
			// so reusing across a single all-at-once pass finds nothing to copy.
			// Group by `product.id` (never across different plans) and resolve each
			// group SEQUENTIALLY: reuse against whatever's already been resolved
			// so far, create for real only if nothing matched, then add this
			// version to the resolved set before moving to the next. The first
			// version in a group pays for one real Stripe price; every sibling
			// after it reuses that instead of minting its own.
			const groupsByPlanId = new Map<string, FullProduct[]>();
			for (const product of productsWithPreparedRows) {
				const group = groupsByPlanId.get(product.id) ?? [];
				group.push(product);
				groupsByPlanId.set(product.id, group);
			}

			await Promise.all(
				Array.from(groupsByPlanId.values()).map(async (group) => {
					const resolved: FullProduct[] = [];
					for (const product of group) {
						await applyStripeResourceReuseForProduct({
							ctx,
							product,
							candidateProducts: resolved,
							reuseProcessor: false,
						});
						await initStripeResourcesForProducts({ ctx, products: [product] });
						resolved.push(product);
					}
				}),
			);
		}

		return planned;
	},
};
