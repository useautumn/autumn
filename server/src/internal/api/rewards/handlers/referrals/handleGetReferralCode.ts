import { ErrCode } from "@autumn/shared";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { generateReferralCode } from "@/internal/rewards/referralUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get referral code",
		handler: async (req, res) => {
			const { orgId, env, db } = req;
			const { program_id: rewardProgramId, customer_id: customerId } = req.body;

			const [rewardProgram, customer] = await Promise.all([
				RewardProgramService.get({
					db,
					idOrInternalId: rewardProgramId,
					orgId,
					env,
					errorIfNotFound: true,
				}),
				CusService.get({
					db: req.db,
					orgId,
					env,
					idOrInternalId: customerId,
				}),
			]);

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					statusCode: 404,
					code: ErrCode.CustomerNotFound,
				});
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
					orgId,
					env,
					internalCustomerId: customer.internal_id,
					internalRewardProgramId: rewardProgram.internal_id,
				});

			if (!referralCode) {
				const code = generateReferralCode();

				referralCode = {
					code,
					org_id: orgId,
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

			res.status(200).json({
				code: referralCode.code,
				customer_id: customer.id,
				created_at: referralCode.created_at,
			});
		},
	});
