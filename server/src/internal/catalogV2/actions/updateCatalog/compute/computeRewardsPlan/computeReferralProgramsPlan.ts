import type { UpdateCatalogParams } from "@autumn/shared";
import type { RewardStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";
import type {
	RemoveReferralProgramPlan,
	UpsertReferralProgramPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateRewardPlan";
import {
	comparableProgram,
	previousAttributesOf,
} from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/comparableReward";

export const computeUpsertReferralProgramsPlan = ({
	params,
	rewardStatesContext,
}: {
	params: UpdateCatalogParams;
	rewardStatesContext: RewardStatesContext;
}): UpsertReferralProgramPlan[] =>
	(params.referral_programs ?? []).map((entry) => {
		const current =
			entry.internal_id === undefined
				? rewardStatesContext.programs.find(
						(state) => state.program.id === entry.id,
					)
				: rewardStatesContext.programs.find(
						(state) => state.internalId === entry.internal_id,
					);

		const desired = {
			id: entry.id,
			reward_id: entry.reward_id,
			redeem_on: entry.redeem_on,
			received_by: entry.received_by,
			max_redemptions: entry.max_redemptions ?? null,
			plan_ids: entry.plan_ids ?? null,
			exclude_trial: entry.exclude_trial ?? false,
		};

		return {
			referralProgramId: entry.id,
			rewardId: entry.reward_id,
			internalId: current?.internalId ?? null,
			desired,
			previousAttributes:
				current === undefined
					? null
					: previousAttributesOf({
							from: comparableProgram(current.program),
							to: comparableProgram(desired),
						}),
		} satisfies UpsertReferralProgramPlan;
	});

export const computeRemoveReferralProgramsPlan = ({
	params,
	rewardStatesContext,
}: {
	params: UpdateCatalogParams;
	rewardStatesContext: RewardStatesContext;
}): RemoveReferralProgramPlan[] => {
	if (params.skip_deletions !== false) return [];
	if (params.referral_programs === undefined) return [];

	const statedIds = new Set(params.referral_programs.map(({ id }) => id));
	const statedInternalIds = new Set(
		params.referral_programs.flatMap((entry) =>
			entry.internal_id === undefined ? [] : [entry.internal_id],
		),
	);

	return rewardStatesContext.programs
		.filter(
			(state) =>
				!statedIds.has(state.program.id) &&
				!statedInternalIds.has(state.internalId),
		)
		.map((state) => ({
			referralProgramId: state.program.id,
			internalId: state.internalId,
			byOmission: true,
		}));
};
