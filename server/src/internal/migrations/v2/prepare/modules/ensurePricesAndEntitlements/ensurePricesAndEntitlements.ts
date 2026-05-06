import { type Entitlement, entitlements } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import type { PrepareModule } from "../../types/prepareModule.js";
import type {
	EnsurePricesAndEntitlementsResult,
	EntitlementItemRef,
} from "./types.js";

export type EnsurePricesAndEntitlementsInput = {
	target_plan_id: string;
	feature_id: string;
};

/** Deterministic ID per (migration, product version, feature). Idempotent across runs. */
export const entitlementIdFor = ({
	migrationInternalId,
	productInternalId,
	internalFeatureId,
}: {
	migrationInternalId: string;
	productInternalId: string;
	internalFeatureId: string;
}): string =>
	`ent_mig_${migrationInternalId}_${productInternalId}_${internalFeatureId}`;

export const ensurePricesAndEntitlements: PrepareModule<
	EnsurePricesAndEntitlementsInput,
	EnsurePricesAndEntitlementsResult
> = {
	kind: "ensure_prices_and_entitlements",

	async plan({ ctx, migration, input }) {
		const feature = ctx.features.find((f) => f.id === input.feature_id);
		if (!feature)
			throw new Error(
				`ensurePricesAndEntitlements: unknown feature_id "${input.feature_id}"`,
			);

		// All versions of the target plan in the org's catalog.
		const matchingProducts = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [input.target_plan_id],
			returnAll: true,
			excludeEnts: true,
		});

		const desired: EntitlementItemRef[] = matchingProducts.map((product) => ({
			entitlement_id: entitlementIdFor({
				migrationInternalId: migration.internal_id,
				productInternalId: product.internal_id,
				internalFeatureId: feature.internal_id,
			}),
			product_internal_id: product.internal_id,
			product_id: product.id,
			feature_id: feature.id,
			internal_feature_id: feature.internal_id,
		}));

		return { entitlements: desired };
	},

	async apply({ ctx, planned }) {
		const desired = planned.entitlements;
		const ids = desired.map((d) => d.entitlement_id);

		// Skip rows that already exist in DB. Deterministic IDs make this safe.
		const existing = ids.length
			? await ctx.db
					.select({ id: entitlements.id })
					.from(entitlements)
					.where(inArray(entitlements.id, ids))
			: [];
		const existingIds = new Set(existing.map((r) => r.id));

		const toInsert: Entitlement[] = desired
			.filter((d) => !existingIds.has(d.entitlement_id))
			.map((d) => ({
				id: d.entitlement_id,
				created_at: Date.now(),
				internal_feature_id: d.internal_feature_id,
				internal_product_id: d.product_internal_id,
				is_custom: false,
				allowance_type: null,
				allowance: null,
				interval: null,
				interval_count: 1,
				carry_from_previous: false,
				entity_feature_id: null,
				org_id: ctx.org.id,
				feature_id: d.feature_id,
				usage_limit: null,
				rollover: null,
			}));

		if (toInsert.length > 0) {
			await EntitlementService.insert({ db: ctx.db, data: toInsert });
		}

		return { entitlements: desired };
	},
};
