import type { Feature, FullProduct } from "@autumn/shared";
import type {
	RemoveFeaturePlan,
	UpdateCatalogPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

/** Catalog as it exists after the plan-so-far — pure, no DB. */
export type ProjectedCatalog = {
	features: Feature[];
	products: FullProduct[];
};

/** Accumulated write intent while folding compute steps (no projected yet). */
export type CatalogPlanDraft = {
	insertFeatures: Feature[];
	updateFeatures: UpdateFeaturePlan[];
	removeFeatures: RemoveFeaturePlan[];
	upsertProducts: UpsertProductPlan[];
};

/** One compute step's deltas — merged into the draft by createCatalogComputeState. */
export type CatalogComputeStep = Partial<CatalogPlanDraft>;

/**
 * Fold state for progressive compute. Originals are frozen setup input;
 * `plan` / `projected` advance after each step.
 */
export type CatalogComputeState = {
	originalFeatures: Feature[];
	originalProducts: FullProduct[];
	plan: CatalogPlanDraft;
	projected: ProjectedCatalog;
};

export const emptyCatalogPlanDraft = (): CatalogPlanDraft => ({
	insertFeatures: [],
	updateFeatures: [],
	removeFeatures: [],
	upsertProducts: [],
});

export const toUpdateCatalogPlan = ({
	state,
}: {
	state: CatalogComputeState;
}): UpdateCatalogPlan => ({
	...state.plan,
	migrationDrafts: [],
	projected: state.projected,
});
