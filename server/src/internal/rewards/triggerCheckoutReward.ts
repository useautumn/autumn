import {
	type ReferralCode,
	type Reward,
	RewardCategory,
	type RewardProgram,
	type RewardRedemption,
	RewardTriggerEvent,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { RewardProgramService } from "../rewards/RewardProgramService.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import { triggerFreeProduct } from "./referralUtils/triggerFreeProduct.js";
import { triggerRedemption } from "./referralUtils.js";
import { getRewardCat } from "./rewardUtils.js";
export const runTriggerCheckoutReward = async ({
	db,
	payload,
	logger,
}: {
	db: DrizzleCli;
	payload: any;
	logger: any;
}) => {
	try {
		// Customer redeeming code, product they're buying
		const { customer, product, org, env, subId } = payload;
		const stripeCli = createStripeCli({
			org,
			env,
		});

		// 1. Check if redemption exists
		const redemptions = await RewardRedemptionService.getByCustomer({
			db,
			internalCustomerId: customer.internal_id, // customer that redeemed code
			withRewardProgram: true,
			triggered: false,
			withReferralCode: true,
			triggerWhen: RewardTriggerEvent.Checkout,
		});

		for (const redemption of redemptions) {
			if (
				!redemption ||
				redemption.reward_program.when !== RewardTriggerEvent.Checkout
			) {
				console.info(
					"No redemption found or reward program not set to checkout, skipping",
				);
				return;
			}

			const { reward_program, referral_code: referralCode } =
				redemption as RewardRedemption & {
					reward_program: RewardProgram & { reward: Reward };
					referral_code: ReferralCode;
				};
			const { reward } = reward_program;

			console.info(`--------------------------------`);
			console.info(`CHECKING FOR CHECKOUT REWARD, ORG: ${org.slug}`);
			console.info(
				`Redeemed by: ${customer.name} (${customer.id}) for referral program: ${reward_program.id}`,
			);
			console.info(`Referral code: ${referralCode.code} (${referralCode.id})`);
			console.info(
				`Products: ${reward_program.product_ids?.join(", ")}, ${reward_program.reward.free_product_id}`,
			);

			if (!reward_program.product_ids?.includes(product.id)) {
				console.info(
					`Product ${product.name} (${product.id}) not included in referral program, skipping`,
				);
				if (reward_program.reward.free_product_id !== product.id) {
					return;
				}
			}

			// Check for trial
			let hasTrial = false;
			if (subId) {
				const sub = await stripeCli.subscriptions.retrieve(subId);
				// hasTrial = Boolean(sub.trial_end && sub.trial_end > Date.now());
				hasTrial = sub.status === "trialing";
			}

			if (hasTrial) {
				console.info(`Subscription is on trial, not triggering reward`);
				return;
			}

			// Get redemption count
			const redemptionCount = await RewardProgramService.getCodeRedemptionCount(
				{
					db,
					referralCodeId: referralCode.id,
				},
			);

			if (redemptionCount >= reward_program.max_redemptions!) {
				console.info(
					`Max redemptions reached, not triggering latest redemption`,
				);
				return;
			}

			const rewardCat = getRewardCat(reward);
			if (rewardCat === RewardCategory.FreeProduct) {
				await triggerFreeProduct({
					req: undefined,
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
					referralCode: {
						...referralCode,
						reward_program,
					},
					org,
					env,
					logger,
					reward,
					redemption,
				});
			}
		}
	} catch (error) {
		console.error("Failed to trigger checkout reward");
		console.error(error);
	}
};
