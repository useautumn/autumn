import {
	type DeleteRewardParams,
	type DeleteRewardResponse,
	ErrCode,
	RecaseError,
	type Reward,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rewardProgramRepo, rewardRepo } from "../../repos/index.js";
import { requireApiReward } from "./apiRewardUtils.js";

/** The reward_programs FK cascades, so refuse rather than silently dropping programs */
const assertRewardIsUnlinked = async ({
	ctx,
	reward,
}: {
	ctx: AutumnContext;
	reward: Reward;
}) => {
	const { db, org, env } = ctx;
	const programs = await rewardProgramRepo.list({ db, orgId: org.id, env });
	const linked = programs.filter(
		(program) => program.internal_reward_id === reward.internal_id,
	);

	if (linked.length === 0) return;

	const names = linked.map((program) => program.id).join(", ");
	throw new RecaseError({
		message: `Reward ${reward.id} is linked to referral programs: ${names}. Delete them first.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
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

	// 1. Load and guard
	const reward = await requireApiReward({ ctx, rewardId: params.reward_id });
	await assertRewardIsUnlinked({ ctx, reward });

	// 2. Drop the Stripe coupon, then the row, then any stale promo codes
	await deleteRewardFromStripe({ ctx, reward });

	await rewardRepo.delete({
		db,
		internalId: reward.internal_id,
		env,
		orgId: org.id,
	});

	await deactivateStripePromoCodes({ ctx, reward });

	return { success: true };
};
