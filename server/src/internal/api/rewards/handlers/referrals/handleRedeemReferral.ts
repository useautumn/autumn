import {
	CustomerNotFoundError,
	ErrCode,
	InternalError,
	RecaseError,
	RewardCategory,
	type RewardRedemption,
	RewardTriggerEvent,
} from "@autumn/shared";
import { z } from "zod/v4";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { triggerFreeProduct } from "@/internal/rewards/referralUtils/triggerFreeProduct.js";
import { triggerRedemption } from "@/internal/rewards/referralUtils.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { createRoute } from "../../../../../honoMiddlewares/routeHandler";

export const handleRedeemReferral = createRoute({
	body: z.object({
		code: z.string(),
		customer_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { code, customer_id: customerId } = c.req.valid("json");

		// 1. Get redeemed by customer, and referral code
		const [customer, referralCode] = await Promise.all([
			CusService.get({
				db,
				orgId: org.id,
				env,
				idOrInternalId: customerId,
			}),
			RewardProgramService.getReferralCode({
				db,
				orgId: org.id,
				env,
				code,
				withRewardProgram: true,
			}),
		]);

		if (!customer) throw new CustomerNotFoundError({ customerId });

		// 2. Check that code has not reached max redemptions
		const redemptionCount = await RewardProgramService.getCodeRedemptionCount({
			db,
			referralCodeId: referralCode.id,
		});

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
			db,
			internalId: referralCode.internal_customer_id,
		});

		if (!codeCustomer) {
			throw new InternalError({
				message: `Referral code customer not found, internal ID: ${referralCode.internal_customer_id}`,
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
			referralCode.reward_program.when === RewardTriggerEvent.CustomerCreation;

		if (redeemRewardNow) {
			const reward = await RewardService.get({
				db,
				orgId: org.id,
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
					ctx,
					referralCode,
					redeemer: customer,
					rewardProgram: reward_program,
					redemption,
				});
			} else {
				await triggerRedemption({
					ctx,
					referralCode,
					reward,
					redemption,
				});
			}
		}

		return c.json({
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
