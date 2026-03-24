import {
	type Customer,
	type Product,
	type ReferralCode,
	type Reward,
	RewardCategory,
	type RewardProgram,
	type RewardRedemption,
	RewardTriggerEvent,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	redemptionRepo,
	referralCodeRepo,
} from "@/internal/rewards/repos/index.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";
import { triggerDiscount } from "./triggerDiscount.js";
import { triggerFreeProduct } from "./triggerFreeProduct.js";

/** Process checkout-triggered reward redemptions (called from job queue) */
export const runTriggerCheckoutReward = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: {
		customer: Customer;
		product: Product;
		subId?: string;
	};
}) => {
	const { db, org, env, logger } = ctx;

	try {
		const { customer, product, subId } = payload;
		const stripeCli = createStripeCli({
			org,
			env,
		});

		// Check if redemption exists
		const redemptions = await redemptionRepo.getByCustomer({
			db,
			internalCustomerId: customer.internal_id,
			triggered: false,
		});

		for (const redemption of redemptions) {
			if (
				!redemption ||
				redemption.reward_program.when !== RewardTriggerEvent.Checkout
			) {
				logger.info(
					"No redemption found or reward program not set to checkout, skipping",
				);
				// BUG FIX: was `return` which exited the entire function — should be `continue`
				continue;
			}

			const { reward_program, referral_code: referralCode } =
				redemption as RewardRedemption & {
					reward_program: RewardProgram & { reward: Reward };
					referral_code: ReferralCode;
				};
			const { reward } = reward_program;

			logger.info(`--------------------------------`);
			logger.info(`CHECKING FOR CHECKOUT REWARD, ORG: ${org.slug}`);
			logger.info(
				`Redeemed by: ${customer.name} (${customer.id}) for referral program: ${reward_program.id}`,
			);
			logger.info(`Referral code: ${referralCode.code} (${referralCode.id})`);
			logger.info(
				`Products: ${reward_program.product_ids?.join(", ")}, ${reward_program.reward.free_product_id}`,
			);

			if (!reward_program.product_ids?.includes(product.id)) {
				logger.info(
					`Product ${product.name} (${product.id}) not included in referral program, skipping`,
				);
				if (reward_program.reward.free_product_id !== product.id) {
					// BUG FIX: was `return` which exited the entire function — should be `continue`
					continue;
				}
			}

			// Check for trial
			let hasTrial = false;
			if (subId) {
				const sub = await stripeCli.subscriptions.retrieve(subId);
				hasTrial = sub.status === "trialing";
			}

			if (hasTrial) {
				logger.info(`Subscription is on trial, not triggering reward`);
				// BUG FIX: was `return` which exited the entire function — should be `continue`
				continue;
			}

			// Get redemption count
			const redemptionCount = await referralCodeRepo.getRedemptionCount({
				db,
				referralCodeId: referralCode.id,
			});

			if (redemptionCount >= reward_program.max_redemptions!) {
				logger.info(
					`Max redemptions reached, not triggering latest redemption`,
				);
				// BUG FIX: was `return` which exited the entire function — should be `continue`
				continue;
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
				await triggerDiscount({
					ctx,
					referralCode: {
						...referralCode,
						reward_program,
					},
					reward,
					redemption,
				});
			}
		}
	} catch (error) {
		logger.error(`Failed to trigger checkout reward: ${error}`);
	}
};
