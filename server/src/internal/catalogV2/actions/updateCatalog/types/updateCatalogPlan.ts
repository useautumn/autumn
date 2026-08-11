import type { Feature } from "@autumn/shared";
import type { ProjectedCatalog } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export type RemoveFeaturePlan = {
	featureId: string;
	/** Null when the id is unknown — errors throws FeatureNotFound. */
	current: Feature | null;
	/** Archive instead of hard delete — some reference survives the batch. */
	willArchive: boolean;
	hasCustomerEntitlements: boolean;
};

/**
 * The desired catalog state change — pure Autumn intent, no writes.
 * Preview renders it; execute persists it. Every DB write execute makes is
 * declared on an insert / update / remove / upsert entry.
 */
export type UpdateCatalogPlan = {
	insertFeatures: Feature[];
	updateFeatures: UpdateFeaturePlan[];
	removeFeatures: RemoveFeaturePlan[];
	/** Ordered product-row ops — create / update / none (execute order). */
	upsertProducts: UpsertProductPlan[];

	/** Catalog after the fold's last advance — original + cumulative plan. */
	projected: ProjectedCatalog;
};
