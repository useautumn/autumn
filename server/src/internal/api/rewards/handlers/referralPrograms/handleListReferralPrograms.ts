import {
	InternalError,
	ListReferralProgramsParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toApiReferralProgram } from "@/internal/rewards/actions/createApiReferralProgram.js";
import {
	rewardProgramRepo,
	rewardRepo,
} from "@/internal/rewards/repos/index.js";

export const handleListReferralPrograms = createRoute({
	scopes: [Scopes.Rewards.Read],
	body: ListReferralProgramsParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const [programs, rewards] = await Promise.all([
			rewardProgramRepo.list({ db: ctx.db, orgId: ctx.org.id, env: ctx.env }),
			rewardRepo.list({ db: ctx.db, orgId: ctx.org.id, env: ctx.env }),
		]);
		const rewardIdByInternalId = new Map(
			rewards.map(({ internal_id, id }) => [internal_id, id]),
		);
		return c.json({
			referral_programs: programs.map((rewardProgram) => {
				const rewardId = rewardIdByInternalId.get(
					rewardProgram.internal_reward_id,
				);
				if (!rewardId) {
					throw new InternalError({
						message: `Referral program ${rewardProgram.id} has no reward`,
					});
				}
				return toApiReferralProgram({ rewardProgram, rewardId });
			}),
		});
	},
});
