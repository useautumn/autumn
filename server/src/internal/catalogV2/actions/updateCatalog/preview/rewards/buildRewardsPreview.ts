import type { PreviewUpdateCatalogResponse } from "@autumn/shared";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";

/** Pure map: computed plan → preview response rewards + referral programs. */
export const buildRewardsPreview = ({
	updateCatalogPlan,
}: {
	updateCatalogPlan: UpdateCatalogPlan;
}): Pick<PreviewUpdateCatalogResponse, "rewards" | "referral_programs"> => ({
	rewards: [
		...updateCatalogPlan.upsertRewards.map((upsert) => ({
			id: upsert.rewardId,
			internal_id: upsert.internalId,
			name: upsert.name,
			kind: upsert.kind,
			action:
				upsert.internalId === null
					? ("create" as const)
					: upsert.previousAttributes
						? ("update" as const)
						: ("none" as const),
			previous_attributes: upsert.previousAttributes,
		})),
		...updateCatalogPlan.removeRewards.map((remove) => ({
			id: remove.rewardId,
			internal_id: remove.internalId,
			name:
				remove.current.kind === "coupon"
					? remove.current.coupon.name
					: remove.current.featureGrant.name,
			kind: remove.current.kind,
			action: "delete" as const,
			previous_attributes: null,
		})),
	],
	referral_programs: [
		...updateCatalogPlan.upsertReferralPrograms.map((upsert) => ({
			id: upsert.referralProgramId,
			internal_id: upsert.internalId,
			reward_id: upsert.rewardId,
			action:
				upsert.internalId === null
					? ("create" as const)
					: upsert.previousAttributes
						? ("update" as const)
						: ("none" as const),
			previous_attributes: upsert.previousAttributes,
		})),
		...updateCatalogPlan.removeReferralPrograms.map((remove) => ({
			id: remove.referralProgramId,
			internal_id: remove.internalId,
			reward_id: null,
			action: "delete" as const,
			previous_attributes: null,
		})),
	],
});
