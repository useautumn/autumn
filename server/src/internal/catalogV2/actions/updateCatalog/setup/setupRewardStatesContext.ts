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
	if (params.rewards === undefined && params.referral_programs === undefined)
		return emptyRewardStatesContext();

	const loaded = await loadRewardStates({ ctx });
	// Loaded whenever a reward could be removed, not only when the payload
	// states programs: a link the payload never mentions still blocks a delete.
	const programs = await loadReferralProgramStates({
		ctx,
		idByInternalId: loaded.idByInternalId,
		statableInternalIds: loaded.statableInternalIds,
	});

	return {
		rewards: loaded.rewards,
		unstatableIds: loaded.unstatableIds,
		programs,
	};
};
