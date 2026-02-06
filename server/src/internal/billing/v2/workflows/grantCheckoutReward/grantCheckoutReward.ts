/**
 * Workflow: GrantCheckoutReward
 *
 * Triggers checkout rewards when a customer completes a purchase.
 * Checks for reward redemptions, validates the subscription isn't on trial,
 * and applies the appropriate reward (free product or other reward type).
 */

import {
	type AppEnv,
	type Customer,
	type FullProduct,
	type ReferralCode,
	type Reward,
	RewardCategory,
	type RewardProgram,
	type RewardRedemption,
	RewardTriggerEvent,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { RewardProgramService } from "@/internal/rewards/RewardProgramService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { triggerFreeProduct } from "@/internal/rewards/referralUtils/triggerFreeProduct.js";
import { triggerRedemption } from "@/internal/rewards/referralUtils.js";
import { getRewardCat } from "@/internal/rewards/rewardUtils.js";

export type GrantCheckoutRewardPayload = {
	orgId: string;
	env: AppEnv;
	customerId: string;
	productId: string;
	stripeSubscriptionId?: string;
};

export const grantCheckoutReward = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: GrantCheckoutRewardPayload;
}) => {
	const { db, org, env, logger } = ctx;
	const { customerId, productId, stripeSubscriptionId } = payload;

	const [customer, product] = await Promise.all([
		CusService.get({ db, idOrInternalId: customerId, orgId: org.id, env }),
		ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env,
		}),
	]);

	if (!customer) {
		logger.warn(
			`[grantCheckoutReward] Customer ${customerId} not found, skipping`,
		);
		return;
	}

	const stripeCli = createStripeCli({ org, env });

	const redemptions = await RewardRedemptionService.getByCustomer({
		db,
		internalCustomerId: customer.internal_id,
		withRewardProgram: true,
		triggered: false,
		withReferralCode: true,
		triggerWhen: RewardTriggerEvent.Checkout,
	});

	for (const redemption of redemptions) {
		await processRedemption({
			ctx,
			customer,
			product,
			redemption,
			stripeSubscriptionId,
			stripeCli,
		});
	}
};

const processRedemption = async ({
	ctx,
	customer,
	product,
	redemption,
	stripeSubscriptionId,
	stripeCli,
}: {
	ctx: AutumnContext;
	customer: Customer;
	product: FullProduct;
	redemption: RewardRedemption & {
		reward_program: RewardProgram & { reward: Reward };
		referral_code: ReferralCode;
	};
	stripeSubscriptionId?: string;
	stripeCli: ReturnType<typeof createStripeCli>;
}) => {
	const { db, org, logger } = ctx;

	if (redemption.reward_program.when !== RewardTriggerEvent.Checkout) {
		logger.info(
			`[grantCheckoutReward] Reward program not set to checkout trigger, skipping`,
		);
		return;
	}

	const { reward_program, referral_code } = redemption;
	const { reward } = reward_program;

	logger.info(`--------------------------------`);
	logger.info(`CHECKING FOR CHECKOUT REWARD, ORG: ${org.slug}`);
	logger.info(
		`Redeemed by: ${customer.name} (${customer.id}) for referral program: ${reward_program.id}`,
	);
	logger.info(`Referral code: ${referral_code.code} (${referral_code.id})`);
	logger.info(
		`Products: ${reward_program.product_ids?.join(", ")}, ${reward.free_product_id}`,
	);

	if (!isProductEligible({ product, rewardProgram: reward_program, logger })) {
		return;
	}

	if (
		await isSubscriptionTrialing({
			stripeSubscriptionId,
			stripeCli,
			logger,
		})
	) {
		return;
	}

	if (
		await isMaxRedemptionsReached({
			db,
			referralCode: referral_code,
			rewardProgram: reward_program,
			logger,
		})
	) {
		return;
	}

	await applyReward({
		ctx,
		customer,
		redemption,
		rewardProgram: reward_program,
		referralCode: referral_code,
		reward,
	});
};

const isProductEligible = ({
	product,
	rewardProgram,
	logger,
}: {
	product: FullProduct;
	rewardProgram: RewardProgram & { reward: Reward };
	logger: AutumnContext["logger"];
}): boolean => {
	const { reward } = rewardProgram;

	if (!rewardProgram.product_ids?.includes(product.id)) {
		if (reward.free_product_id !== product.id) {
			logger.info(
				`[grantCheckoutReward] Product ${product.name} (${product.id}) not in reward program, skipping`,
			);
			return false;
		}
	}

	return true;
};

const isSubscriptionTrialing = async ({
	stripeSubscriptionId,
	stripeCli,
	logger,
}: {
	stripeSubscriptionId?: string;
	stripeCli: ReturnType<typeof createStripeCli>;
	logger: AutumnContext["logger"];
}): Promise<boolean> => {
	if (!stripeSubscriptionId) {
		return false;
	}

	const sub = await stripeCli.subscriptions.retrieve(stripeSubscriptionId);
	const isTrialing = sub.status === "trialing";

	if (isTrialing) {
		logger.info(
			`[grantCheckoutReward] Subscription is on trial, not triggering reward`,
		);
	}

	return isTrialing;
};

const isMaxRedemptionsReached = async ({
	db,
	referralCode,
	rewardProgram,
	logger,
}: {
	db: AutumnContext["db"];
	referralCode: ReferralCode;
	rewardProgram: RewardProgram;
	logger: AutumnContext["logger"];
}): Promise<boolean> => {
	const redemptionCount = await RewardProgramService.getCodeRedemptionCount({
		db,
		referralCodeId: referralCode.id,
	});

	if (redemptionCount >= rewardProgram.max_redemptions!) {
		logger.info(
			`[grantCheckoutReward] Max redemptions (${rewardProgram.max_redemptions}) reached, skipping`,
		);
		return true;
	}

	return false;
};

const applyReward = async ({
	ctx,
	customer,
	redemption,
	rewardProgram,
	referralCode,
	reward,
}: {
	ctx: AutumnContext;
	customer: Customer;
	redemption: RewardRedemption;
	rewardProgram: RewardProgram & { reward: Reward };
	referralCode: ReferralCode;
	reward: Reward;
}) => {
	const rewardCat = getRewardCat(reward);

	if (rewardCat === RewardCategory.FreeProduct) {
		await triggerFreeProduct({
			ctx,
			referralCode,
			redeemer: customer,
			rewardProgram,
			redemption,
		});
	} else {
		await triggerRedemption({
			ctx,
			referralCode: { ...referralCode, reward_program: rewardProgram },
			reward,
			redemption,
		});
	}
};
