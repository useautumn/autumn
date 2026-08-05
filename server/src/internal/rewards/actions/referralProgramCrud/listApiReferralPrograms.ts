import type { ReferralProgramsListResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiReferralProgram } from "../../apiRewards/getApiReferralProgram.js";
import { rewardProgramRepo } from "../../repos/index.js";
import { rewardIdByInternalId } from "./referralProgramUtils.js";

export const listApiReferralPrograms = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ReferralProgramsListResponse> => {
	const { db, org, env } = ctx;

	// 1. Fetch
	const programs = await rewardProgramRepo.list({ db, orgId: org.id, env });

	// 2. Map internal reward ids back to public ids
	const rewardIds = await rewardIdByInternalId({ ctx, programs });

	return {
		list: programs.map((rewardProgram) =>
			getApiReferralProgram({
				rewardProgram,
				rewardId: rewardIds.get(rewardProgram.internal_reward_id) ?? "",
			}),
		),
	};
};
