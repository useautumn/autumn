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
	/** Null when the reward is new — the id is minted on write. */
	internalId: string | null;
	/** The branch body exactly as the payload stated it. */
	params: UpdateCatalogRewardParams;
	/** Changed reward fields holding their previous values; null = nothing changed. */
	previousAttributes: Record<string, unknown> | null;
};

export type RemoveRewardPlan = {
	rewardId: string;
	internalId: string;
	current: CatalogRewardState;
	/** Absent from a full-state config rather than named explicitly. */
	byOmission: boolean;
};

export type UpsertReferralProgramPlan = {
	referralProgramId: string;
	rewardId: string;
	internalId: string | null;
	/** Merged desired program; execute passes the fields straight through. */
	desired: Omit<ApiReferralProgramV0, "created_at">;
	previousAttributes: Record<string, unknown> | null;
};

export type RemoveReferralProgramPlan = {
	referralProgramId: string;
	internalId: string;
	byOmission: boolean;
};
