import type {
	ApiReferralProgramV0,
	CatalogRewardKind,
	UpdateCatalogRewardParams,
} from "@autumn/shared";
import type { CatalogRewardState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";

export type UpsertRewardPlan = {
	rewardId: string;
	kind: CatalogRewardKind;
	name: string;
	internalId: string | null;
	params: UpdateCatalogRewardParams;
	previousAttributes: Record<string, unknown> | null;
};

export type RemoveRewardPlan = {
	rewardId: string;
	internalId: string;
	current: CatalogRewardState;
	byOmission: boolean;
};

export type UpsertReferralProgramPlan = {
	referralProgramId: string;
	rewardId: string;
	internalId: string | null;
	desired: Omit<ApiReferralProgramV0, "created_at">;
	previousAttributes: Record<string, unknown> | null;
};

export type RemoveReferralProgramPlan = {
	referralProgramId: string;
	internalId: string;
	byOmission: boolean;
};
