import type {
	ApiReferralProgramV0,
	GetReferralProgramParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { requireProgram, toApiProgram } from "./referralProgramUtils.js";

export const getApiReferralProgramById = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetReferralProgramParams;
}): Promise<ApiReferralProgramV0> => {
	const rewardProgram = await requireProgram({
		ctx,
		referralProgramId: params.referral_program_id,
	});

	return toApiProgram({ ctx, rewardProgram });
};
