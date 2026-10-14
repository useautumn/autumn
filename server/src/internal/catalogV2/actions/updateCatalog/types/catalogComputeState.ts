import type { Feature, FullProduct } from "@autumn/shared";
import type {
	RemoveFeaturePlan,
	RemovePlanPlan,
	UpdateCatalogPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export type ProjectedCatalog = {
	features: Feature[];
	products: FullProduct[];
};

export type CatalogPlanDraft = {
	insertFeatures: Feature[];
	updateFeatures: UpdateFeaturePlan[];
	removeFeatures: RemoveFeaturePlan[];
	upsertProducts: UpsertProductPlan[];
	removePlans: RemovePlanPlan[];
};

export type CatalogComputeStep = Partial<CatalogPlanDraft>;

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
	removePlans: [],
});

export const toUpdateCatalogPlan = ({
	state,
}: {
	state: CatalogComputeState;
}): UpdateCatalogPlan => ({
	...state.plan,
	renamePlans: [],
	migrationDrafts: [],
	upsertRewards: [],
	removeRewards: [],
	upsertReferralPrograms: [],
	removeReferralPrograms: [],
	projected: state.projected,
});
