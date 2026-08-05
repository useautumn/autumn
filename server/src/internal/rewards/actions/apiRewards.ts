import {
	type DeleteRewardParams,
	type DeleteRewardResponse,
	ErrCode,
	type GetRewardParams,
	type GetRewardResponse,
	RecaseError,
	type Reward,
	RewardType,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCoupon } from "../apiRewards/getApiCoupon.js";
import { getApiFeatureGrant } from "../apiRewards/getApiFeatureGrant.js";
import { resolveCouponPlanIds } from "../apiRewards/resolveCouponPlanIds.js";
import { rewardProgramRepo, rewardRepo } from "../repos/index.js";

const COUPON_TYPES = new Set<RewardType>([
	RewardType.PercentageDiscount,
	RewardType.FixedDiscount,
	RewardType.InvoiceCredits,
]);

export const requireApiReward = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}): Promise<Reward> => {
	const { db, org, env } = ctx;
	const reward = await rewardRepo.get({
		db,
		idOrInternalId: id,
		orgId: org.id,
		env,
	});

	if (!reward) {
		throw new RecaseError({
			message: `Reward ${id} not found`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	if (reward.type === RewardType.FreeProduct) {
		throw new RecaseError({
			message: `Reward ${id} is a free product reward, which is not exposed on the API`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return reward;
};

export const toApiRewardResponse = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}): Promise<GetRewardResponse> => {
	const { db, features } = ctx;

	if (reward.type === RewardType.FeatureGrant) {
		return { feature_grant: getApiFeatureGrant({ reward, features }) };
	}

	const { internalProductIdByPriceId, planIdByInternalProductId } =
		await resolveCouponPlanIds({ db, rewards: [reward] });

	return {
		coupon: getApiCoupon({
			reward,
			planIdByInternalProductId,
			internalProductIdByPriceId,
		}),
	};
};

export const getApiRewardById = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: GetRewardParams;
}): Promise<GetRewardResponse> => {
	const reward = await requireApiReward({ ctx, id: params.id });
	return toApiRewardResponse({ ctx, reward });
};

const deleteRewardFromStripe = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}) => {
	const { org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	try {
		await stripeCli.coupons.del(reward.id);
	} catch (error) {
		logger.warn(
			`Failed to delete coupon from stripe: ${(error as { message: string }).message}`,
			{ rewardId: reward.id, error },
		);
	}
};

/** A stale active promo code blocks recreating the same code later */
const deactivateStripePromoCodes = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}) => {
	const { org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	for (const promoCode of reward.promo_codes ?? []) {
		try {
			for await (const promo of stripeCli.promotionCodes.list({
				code: promoCode.code,
				coupon: reward.id,
				active: true,
				limit: 100,
			})) {
				try {
					await stripeCli.promotionCodes.update(promo.id, { active: false });
				} catch (error) {
					logger.warn(
						`Failed to deactivate promo code ${promoCode.code} (${promo.id}) in stripe after deleting reward ${reward.id}`,
						{ rewardId: reward.id, code: promoCode.code, error },
					);
				}
			}
		} catch (error) {
			logger.warn(
				`Failed to list promo codes for ${promoCode.code} in stripe after deleting reward ${reward.id}`,
				{ rewardId: reward.id, code: promoCode.code, error },
			);
		}
	}
};

export const deleteApiReward = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteRewardParams;
}): Promise<DeleteRewardResponse> => {
	const { db, org, env } = ctx;
	const reward = await requireApiReward({ ctx, id: params.id });

	// The FK cascades, so refuse rather than silently dropping referral programs
	const programs = await rewardProgramRepo.list({ db, orgId: org.id, env });
	const linked = programs.filter(
		(program) => program.internal_reward_id === reward.internal_id,
	);

	if (linked.length > 0) {
		throw new RecaseError({
			message: `Reward ${reward.id} is linked to referral program${
				linked.length > 1 ? "s" : ""
			} ${linked.map((program) => program.id).join(", ")}. Delete ${
				linked.length > 1 ? "them" : "it"
			} first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	await deleteRewardFromStripe({ ctx, reward });

	await rewardRepo.delete({
		db,
		internalId: reward.internal_id,
		env,
		orgId: org.id,
	});

	await deactivateStripePromoCodes({ ctx, reward });

	return { id: reward.id, deleted: true };
};
