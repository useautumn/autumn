import { type Entitlement, findFeatureById, type Price } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { basePriceToProductItem } from "@autumn/shared/api/products/components/basePrice/basePriceToProductItem.js";
import { planItemV1ToPriceAndEnt } from "@autumn/shared/api/products/items/mappers/planItemV1ToPriceAndEnt.js";
import { itemToPriceAndEnt } from "@autumn/shared/utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
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
	hash,
}: {
	scopeId: string;
	opIndex: number;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "pr",
		value: { scopeId, opIndex, kind: "base_price", hash },
	});

export const priceIdFor = ({
	scopeId,
	opIndex,
	itemIndex,
	internalFeatureId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	itemIndex: number;
	internalFeatureId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "pr",
		value: {
			scopeId,
			opIndex,
			itemIndex,
			internalFeatureId,
			kind: "add_item",
			hash,
		},
	});

export const entitlementIdFor = ({
	scopeId,
	opIndex,
	itemIndex,
	internalFeatureId,
	hash,
}: {
	scopeId: string;
	opIndex: number;
	itemIndex: number;
	internalFeatureId: string;
	hash: string;
}): string =>
	preparedRowId({
		prefix: "ent",
		value: {
			scopeId,
			opIndex,
			itemIndex,
			internalFeatureId,
			kind: "add_item",
			hash,
		},
	});

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

			if (customize.price) {
				const hash = artifactHash({ value: customize.price });
				const priceId = basePriceIdFor({ scopeId, opIndex, hash });
				const item = basePriceToProductItem({
					ctx,
					basePrice: customize.price,
				});
				const { newPrice, updatedPrice } = itemToPriceAndEnt({
					item,
					orgId: ctx.org.id,
					isCustom: true,
					features: ctx.features,
				});
				const price = newPrice ?? updatedPrice;

				if (price) {
					pricesById.set(priceId, {
						...price,
						id: priceId,
						internal_product_id: null,
					});
					artifacts.push({
						op_index: opIndex,
						kind: "base_price",
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
					hash,
				});
				const priceId = priceIdFor({
					scopeId,
					opIndex,
					itemIndex,
					internalFeatureId: feature.internal_id,
					hash,
				});

				const { newEnt, newPrice } = planItemV1ToPriceAndEnt({
					ctx,
					item,
					orgId: ctx.org.id,
					isCustom: true,
				});

				if (newEnt) {
					entitlementsById.set(entitlementId, {
						...newEnt,
						id: entitlementId,
						internal_product_id: null,
					});
				}
				if (newPrice) {
					pricesById.set(priceId, {
						...newPrice,
						id: priceId,
						entitlement_id: newEnt ? entitlementId : newPrice.entitlement_id,
						internal_product_id: null,
					});
				}

				artifacts.push({
					op_index: opIndex,
					kind: "add_item",
					item_index: itemIndex,
					hash,
					...(newPrice ? { price_id: priceId } : {}),
					...(newEnt ? { entitlement_id: entitlementId } : {}),
				});
			}
		}

		return {
			entitlements: Array.from(entitlementsById.values()),
			prices: Array.from(pricesById.values()),
			artifacts,
		};
	},

	async apply({ ctx, planned }) {
		if (planned.entitlements.length > 0) {
			await EntitlementService.upsert({
				db: ctx.db,
				data: planned.entitlements,
			});
		}
		if (planned.prices.length > 0) {
			await PriceService.upsert({ db: ctx.db, data: planned.prices });
		}

		return planned;
	},
};
