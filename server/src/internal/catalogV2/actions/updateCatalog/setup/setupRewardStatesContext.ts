import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	loadReferralProgramStates,
	loadRewardStates,
} from "@/internal/catalogV2/actions/updateCatalog/setup/loadRewardStates";
import {
	emptyRewardStatesContext,
	type RewardStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";

/**
 * Loaded only when the payload speaks for rewards or programs: a payload that
 * mentions neither has no opinion about them, so it pays for no reads.
 */
export const setupRewardStatesContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<RewardStatesContext> => {
	const statesRewards = params.rewards !== undefined;
	const statesPrograms = params.referral_programs !== undefined;
	if (!statesRewards && !statesPrograms) return emptyRewardStatesContext();

	const loaded = await loadRewardStates({ ctx });
	const programs = statesPrograms
		? await loadReferralProgramStates({
				ctx,
				idByInternalId: loaded.idByInternalId,
			})
		: [];

	return {
		rewards: loaded.rewards,
		unstatableIds: loaded.unstatableIds,
		programs,
	};
};
