import {
	ErrCode,
	findFeatureByInternalId,
	getGlobalMaxRedemption,
	RecaseError,
	RewardType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { assertFirstTimeStripeCustomer } from "@/external/stripe/customers/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { redemptionRepo, rewardRepo } from "@/internal/rewards/repos/index.js";
import { generateId } from "@/utils/genUtils.js";
import { grantRewardEntitlements } from "./grantRewardEntitlements.js";

export const redeemPromoCode = async ({
	ctx,
	code,
	customerId,
	rewardInternalId,
}: {
	ctx: AutumnContext;
	code: string;
	customerId: string;
	rewardInternalId?: string;
}) => {
	const { db, org, env } = ctx;

	const reward = await rewardRepo.getByCode({
		db,
		code,
		orgId: org.id,
		env,
		rewardInternalId,
	});

	if (!reward) {
		throw new RecaseError({
			message: rewardInternalId
				? `Promo code "${code}" not found on reward "${rewardInternalId}"`
				: `No reward found for code "${code}"`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	if (reward.type !== RewardType.FeatureGrant) {
		throw new RecaseError({
			message: `Reward "${reward.id}" is not a feature grant reward`,
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	if (!reward.entitlements?.length) {
		throw new RecaseError({
			message: `Reward "${reward.id}" has no entitlements configured`,
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	const promoCode = reward.promo_codes?.flat().find((pc) => pc.code === code);
	if (!promoCode) {
		throw new RecaseError({
			message: `Promo code "${code}" not found on reward "${reward.id}"`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	const globalMaxRedemption = getGlobalMaxRedemption(promoCode);

	if (globalMaxRedemption) {
		const redemptionCount = await redemptionRepo.getPromoCodeRedemptionCount({
			db,
			rewardInternalId: reward.internal_id,
			promoCode: code,
		});

		if (redemptionCount >= globalMaxRedemption) {
			throw new RecaseError({
				message: `Promo code "${code}" has reached its maximum redemptions`,
				code: ErrCode.ReferralCodeMaxRedemptionsReached,
				statusCode: 400,
			});
		}
	}

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const existingRedemption = await redemptionRepo.getByCustomerAndReward({
		db,
		internalCustomerId: fullCustomer.internal_id,
		rewardInternalId: reward.internal_id,
	});

	if (existingRedemption) {
		throw new RecaseError({
			message: `Customer "${customerId}" has already redeemed this reward`,
			code: ErrCode.CustomerAlreadyRedeemedReferralCode,
			statusCode: 400,
		});
	}

	if (promoCode.first_time_transaction && fullCustomer.processor?.id) {
		const stripeCli = createStripeCli({ org, env });
		await assertFirstTimeStripeCustomer({
			stripeCli,
			stripeCustomerId: fullCustomer.processor.id,
			promoCode: code,
		});
	}

	await grantRewardEntitlements({
		ctx,
		fullCustomer,
		reward,
		balanceIdPrefix: `reward_${code}`,
	});

	await redemptionRepo.insert({
		db,
		rewardRedemption: {
			id: generateId("rr"),
			internal_customer_id: fullCustomer.internal_id,
			reward_internal_id: reward.internal_id,
			promo_code: code,
			referral_code_id: null,
			internal_reward_program_id: null,
			triggered: true,
			applied: true,
			redeemer_applied: true,
			created_at: Date.now(),
			updated_at: Date.now(),
		},
	});

	return {
		reward_id: reward.id,
		entitlements_granted: reward.entitlements.map((ent) => {
			const feature = findFeatureByInternalId({
				features: ctx.features,
				internalId: ent.internal_feature_id,
			});
			return {
				feature_id: feature?.id ?? ent.internal_feature_id,
				balance: ent.allowance ?? 0,
			};
		}),
	};
};
