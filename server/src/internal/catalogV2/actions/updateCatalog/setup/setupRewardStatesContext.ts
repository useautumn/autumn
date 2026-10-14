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
	const needsPrograms =
		params.referral_programs !== undefined || params.skip_deletions === false;
	const loadedPrograms = needsPrograms
		? await loadReferralProgramStates({
				ctx,
				idByInternalId: loaded.idByInternalId,
				statableInternalIds: loaded.statableInternalIds,
			})
		: {
				programs: [],
				hiddenProgramIds: new Set<string>(),
				hiddenProgramInternalIds: new Set<string>(),
			};

	return {
		rewards: loaded.rewards,
		unstatableIds: loaded.unstatableIds,
		unstatableInternalIds: loaded.unstatableInternalIds,
		programs: loadedPrograms.programs,
		hiddenProgramIds: loadedPrograms.hiddenProgramIds,
		hiddenProgramInternalIds: loadedPrograms.hiddenProgramInternalIds,
	};
};
