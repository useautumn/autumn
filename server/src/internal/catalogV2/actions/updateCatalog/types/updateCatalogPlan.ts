import type { CatalogMigration, Feature, FullProduct } from "@autumn/shared";
import type { ProjectedCatalog } from "@/internal/catalogV2/actions/updateCatalog/types/catalogComputeState";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";
import type {
	RemoveReferralProgramPlan,
	RemoveRewardPlan,
	UpsertReferralProgramPlan,
	UpsertRewardPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateRewardPlan";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

export type RemoveFeaturePlan = {
	featureId: string;
	current: Feature | null;
	willArchive: boolean;
	byOmission?: boolean;
	hasCustomerEntitlements: boolean;
	hasSurvivingCatalogReference: boolean;
};

export type RemovePlanPlan = {
	planId: string;
	version: number;
	current: FullProduct | null;
	willArchive: boolean;
	willTombstone: boolean;
	hasCustomers: boolean;
	allVersions: boolean;
};

export type UpdateCatalogPlan = {
	insertFeatures: Feature[];
	updateFeatures: UpdateFeaturePlan[];
	removeFeatures: RemoveFeaturePlan[];
	upsertProducts: UpsertProductPlan[];
	renamePlans: RenameProductPlan[];
	removePlans: RemovePlanPlan[];
	migrationDrafts: CatalogMigration[];
	upsertRewards: UpsertRewardPlan[];
	removeRewards: RemoveRewardPlan[];
	upsertReferralPrograms: UpsertReferralProgramPlan[];
	removeReferralPrograms: RemoveReferralProgramPlan[];

	projected: ProjectedCatalog;
};
