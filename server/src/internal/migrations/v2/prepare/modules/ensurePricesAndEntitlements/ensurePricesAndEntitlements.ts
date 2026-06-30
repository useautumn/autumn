import {
	type Entitlement,
	type FullProduct,
	findFeatureById,
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
import { PlanService } from "@/internal/products/PlanService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import type { PrepareModule } from "../../types/prepareModule.js";
import type {
	EnsurePricesAndEntitlementsResult,
	PreparedArtifactRef,
} from "./types.js";
import { inheritStripeProductFromCatalog } from "./inheritStripeProductFromCatalog.js";

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
	const products = await PlanService.listFull({
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
						const preparedPrice = inheritStripeProductFromCatalog({
							price: {
								...newPrice,
								id: priceId,
								entitlement_id: newEnt
									? entitlementId
									: newPrice.entitlement_id,
								internal_product_id: product.internal_id,
							},
							product,
							products: matchedProducts,
						});

						pricesById.set(priceId, {
							...preparedPrice,
						});
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
			await initStripeResourcesForProducts({
				ctx,
				products: buildProductsWithPreparedRows({
					products: allMatchedProducts,
					prices: planned.prices,
					entitlements: planned.entitlements,
					features: ctx.features,
				}),
			});
		}

		return planned;
	},
};
