import {
	CreateReferralCodeParamsSchema,
	CustomerNotFoundError,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { generateReferralCode } from "@/internal/rewards/referralUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { createRoute } from "../../../../../honoMiddlewares/routeHandler";

export const handleGetReferralCode = createRoute({
	body: CreateReferralCodeParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { program_id: rewardProgramId, customer_id: customerId } =
			c.req.valid("json");

		const [rewardProgram, customer] = await Promise.all([
			RewardProgramService.get({
				db,
				idOrInternalId: rewardProgramId,
				orgId: org.id,
				env,
				errorIfNotFound: true,
			}),
			CusService.get({
				db,
				orgId: org.id,
				env,
				idOrInternalId: customerId,
			}),
		]);

		if (!customer) {
			throw new CustomerNotFoundError({ customerId });
		}

		if (!rewardProgram) {
			throw new RecaseError({
				message: "Reward program not found",
				statusCode: 404,
				code: ErrCode.RewardProgramNotFound,
			});
		}

		// Get referral code by customer and reward trigger
		let referralCode =
			await RewardProgramService.getCodeByCustomerAndRewardProgram({
				db,
				orgId: org.id,
				env,
				internalCustomerId: customer.internal_id,
				internalRewardProgramId: rewardProgram.internal_id,
			});

		if (!referralCode) {
			const code = generateReferralCode();

			referralCode = {
				code,
				org_id: org.id,
				env,
				internal_customer_id: customer.internal_id,
				internal_reward_program_id: rewardProgram.internal_id,
				id: generateId("rc"),
				created_at: Date.now(),
			};

			referralCode = await RewardProgramService.createReferralCode({
				db,
				data: referralCode,
			});
		}

		return c.json({
			code: referralCode.code,
			customer_id: customer.id,
			created_at: referralCode.created_at,
		});
	},
});
