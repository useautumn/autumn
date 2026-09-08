import type { UpdateCatalogParams } from "@autumn/shared";
import type {
	CatalogRewardState,
	RewardStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";
import type {
	RemoveRewardPlan,
	UpsertRewardPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateRewardPlan";
import {
	comparableCoupon,
	comparableFeatureGrant,
	previousAttributesOf,
} from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/comparableReward";
import { rewardBranchOf } from "@/internal/catalogV2/actions/updateCatalog/utils/rewardUpdateUtils/rewardBranch";

const comparableState = (state: CatalogRewardState): Record<string, unknown> =>
	state.kind === "coupon"
		? comparableCoupon(state.coupon)
		: comparableFeatureGrant(state.featureGrant);

/** The row an entry addresses: its stable id first, else its public id. */
const currentFor = ({
	internalId,
	rewardId,
	rewards,
}: {
	internalId: string | undefined;
	rewardId: string;
	rewards: CatalogRewardState[];
}): CatalogRewardState | undefined =>
	internalId === undefined
		? rewards.find((reward) => reward.id === rewardId)
		: rewards.find((reward) => reward.internalId === internalId);

export const computeUpsertRewardsPlan = ({
	params,
	rewardStatesContext,
}: {
	params: UpdateCatalogParams;
	rewardStatesContext: RewardStatesContext;
}): UpsertRewardPlan[] =>
	(params.rewards ?? []).map((entry) => {
		const branch = rewardBranchOf(entry);
		const current = currentFor({
			internalId: branch.body.internal_id,
			rewardId: branch.body.id,
			rewards: rewardStatesContext.rewards,
		});

		// A branch flip is a different kind of row entirely; errors refuses it,
		// so nothing here tries to diff a coupon against a feature grant.
		const previousAttributes =
			current === undefined || current.kind !== branch.kind
				? null
				: previousAttributesOf({
						from: comparableState(current),
						to:
							branch.kind === "coupon"
								? comparableCoupon({ ...branch.body, created_at: 0 })
								: comparableFeatureGrant({ ...branch.body, created_at: 0 }),
					});

		return {
			rewardId: branch.body.id,
			kind: branch.kind,
			name: branch.body.name,
			internalId: current?.internalId ?? null,
			params: entry,
			previousAttributes,
		} satisfies UpsertRewardPlan;
	});

/**
 * Under full state a reward the org holds but the config never states is a
 * removal asked for by omission. Rewards the config cannot express — free
 * products, invoice credits — are not in `rewards` at all, so they are never
 * proposed.
 */
export const computeRemoveRewardsPlan = ({
	params,
	rewardStatesContext,
}: {
	params: UpdateCatalogParams;
	rewardStatesContext: RewardStatesContext;
}): RemoveRewardPlan[] => {
	if (params.skip_deletions !== false) return [];
	if (params.rewards === undefined) return [];

	const statedIds = new Set<string>();
	const statedInternalIds = new Set<string>();
	for (const entry of params.rewards) {
		const { body } = rewardBranchOf(entry);
		statedIds.add(body.id);
		if (body.internal_id !== undefined) statedInternalIds.add(body.internal_id);
	}

	return rewardStatesContext.rewards
		.filter(
			(reward) =>
				!statedIds.has(reward.id) && !statedInternalIds.has(reward.internalId),
		)
		.map((reward) => ({
			rewardId: reward.id,
			internalId: reward.internalId,
			current: reward,
			byOmission: true,
		}));
};
