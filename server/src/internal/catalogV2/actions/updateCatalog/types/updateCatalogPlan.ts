import type { CatalogMigration, Feature, FullProduct } from "@autumn/shared";
import type { ProjectedCatalog } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export type RemoveFeaturePlan = {
	featureId: string;
	/** Null when the id is unknown — errors throws FeatureNotFound. */
	current: Feature | null;
	/** Archive instead of hard delete — some reference survives the batch. */
	willArchive: boolean;
	/** Absent from a full-state config rather than named in remove_features. */
	byOmission?: boolean;
	hasCustomerEntitlements: boolean;
	/** A plan item, price, credit system, or other catalog row still names this
	 * feature — unlike customer history, this push could have cleared it. */
	hasSurvivingCatalogReference: boolean;
};

export type RemovePlanPlan = {
	planId: string;
	version: number;
	/** Null when the id/version is unknown — errors throws ProductNotFound. */
	current: FullProduct | null;
	/** Archive instead of hard delete — some reference survives the batch. */
	willArchive: boolean;
	/** Hide the row (`deleted_at`) — expired-only customers on a non-live pin. */
	willTombstone: boolean;
	hasCustomers: boolean;
	/** True when the request omitted version (every version of this plan_id). */
	allVersions: boolean;
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
	/** Plan-id changes — executed first so every later write sees the new id. */
	renamePlans: RenameProductPlan[];
	removePlans: RemovePlanPlan[];
	/** At most one draft covering every requesting plan; empty when none qualify. */
	migrationDrafts: CatalogMigration[];

	/** Catalog after the fold's last advance — original + cumulative plan. */
	projected: ProjectedCatalog;
};
