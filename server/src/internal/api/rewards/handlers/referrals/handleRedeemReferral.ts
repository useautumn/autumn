import {
	ErrCode,
	RecaseError,
	RewardCategory,
	type RewardRedemption,
	RewardTriggerEvent,
} from "@autumn/shared";
import { parseReqForAction } from "@/internal/analytics/actionUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { triggerFreeProduct } from "@/internal/rewards/referralUtils/triggerFreeProduct.js";
import { triggerRedemption } from "@/internal/rewards/referralUtils.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";

export default async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "redeem referral code",
		handler: async (req, res) => {
			const { orgId, env, logger, db } = req;
			const { code, customer_id: customerId } = req.body;

			// 1. Get redeemed by customer, and referral code
			const [customer, referralCode, org] = await Promise.all([
				CusService.get({
					db,
					orgId,
					env,
					idOrInternalId: customerId,
				}),
				RewardProgramService.getReferralCode({
					db,
					orgId,
					env,
					code,
					withRewardProgram: true,
				}),
				OrgService.getFromReq(req),
			]);

			if (!customer) {
				throw new RecaseError({
					message: "Customer not found",
					statusCode: 404,
					code: ErrCode.CustomerNotFound,
				});
			}

			// 2. Check that code has not reached max redemptions
			const redemptionCount = await RewardProgramService.getCodeRedemptionCount(
				{
					db,
					referralCodeId: referralCode.id,
				},
			);

			if (
				referralCode.reward_program.max_redemptions &&
				redemptionCount >= referralCode.reward_program.max_redemptions
			) {
				throw new RecaseError({
					message: "Referral code has reached max redemptions",
					statusCode: 400,
					code: ErrCode.ReferralCodeMaxRedemptionsReached,
				});
			}

			// 3. Check that customer has not already redeemed a code in this referral program
			const existingRedemptions = await RewardRedemptionService.getByCustomer({
				db,
				internalCustomerId: customer.internal_id,
				internalRewardProgramId: referralCode.internal_reward_program_id,
			});

			if (existingRedemptions.length > 0) {
				throw new RecaseError({
					message: `Customer ${customer.id} has already redeemed a code in this referral program`,
					statusCode: 400,
					code: ErrCode.CustomerAlreadyRedeemedReferralCode,
				});
			}

			// Don't let customer redeem their own code
			const codeCustomer = await CusService.getByInternalId({
				db: req.db,
				internalId: referralCode.internal_customer_id,
			});

			if (!codeCustomer) {
				throw new RecaseError({
					message: "Referral code customer not found",
					statusCode: 404,
					code: ErrCode.CustomerNotFound,
				});
			}

			if (
				codeCustomer.id === customer.id ||
				(notNullish(codeCustomer.fingerprint) &&
					codeCustomer.fingerprint === customer.fingerprint)
			) {
				throw new RecaseError({
					message: "Customer cannot redeem their own code",
					statusCode: 400,
					code: ErrCode.CustomerCannotRedeemOwnCode,
				});
			}

			// 4. Insert redemption into db
			let redemption: RewardRedemption = {
				id: generateId("rr"),
				referral_code_id: referralCode.id,
				internal_customer_id: customer.internal_id, // redeemed by customer
				internal_reward_program_id: referralCode.internal_reward_program_id,
				created_at: Date.now(),
				triggered:
					referralCode.reward_program.when ===
					RewardTriggerEvent.CustomerCreation,
				applied: false,
				updated_at: Date.now(),
				redeemer_applied: false,
			};

			redemption = await RewardRedemptionService.insert({
				db,
				rewardRedemption: redemption,
			});

			// 5. If reward trigger when is immediate:
			const { reward_program } = referralCode;
			const redeemRewardNow =
				referralCode.reward_program.when ===
				RewardTriggerEvent.CustomerCreation;

			if (redeemRewardNow) {
				const reward = await RewardService.get({
					db,
					orgId,
					env,
					idOrInternalId: reward_program.internal_reward_id,
				});

				if (!reward) {
					throw new RecaseError({
						message: `Reward ${reward_program.internal_reward_id} not found`,
						statusCode: 404,
						code: ErrCode.RewardNotFound,
					});
				}

				const rewardCat = getRewardCat(reward);
				if (rewardCat === RewardCategory.FreeProduct) {
					await triggerFreeProduct({
						req: parseReqForAction(req) as ExtendedRequest,
						db,
						referralCode,
						redeemer: customer,
						rewardProgram: reward_program,
						org,
						env,
						logger,
						redemption,
					});
				} else {
					await triggerRedemption({
						db,
						referralCode,
						org,
						env,
						logger,
						reward,
						redemption,
					});
				}
			}

			return res.status(200).json({
				id: redemption.id,
				customer_id: customer.id,
				reward_id: reward_program.reward.id,
				referrer: {
					id: codeCustomer.id,
					name: codeCustomer.name,
					email: codeCustomer.email,
					created_at: codeCustomer.created_at,
				},
				redeemer: {
					id: customer.id,
					name: customer.name,
					email: customer.email,
					created_at: customer.created_at,
				},
			});
		},
	});
