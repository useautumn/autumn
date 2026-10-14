import type {
	DeleteReferralProgramParams,
	DeleteReferralProgramResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rewardProgramRepo } from "../../repos/index.js";

export const deleteApiReferralProgram = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteReferralProgramParams;
}): Promise<DeleteReferralProgramResponse> => {
	const { db, org, env } = ctx;

	await rewardProgramRepo.delete({
		db,
		idOrInternalId: params.referral_program_id,
		orgId: org.id,
		env,
	});

	return { success: true };
};
