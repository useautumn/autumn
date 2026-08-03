import { type AppEnv, ErrCode, RecaseError, type Reward } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { rewardRepo } from "@/internal/rewards/repos/index.js";

export const validateRewardUniqueness = async ({
	db,
	reward,
	orgId,
	env,
	excludeInternalId,
}: {
	db: DrizzleCli;
	reward: Pick<Reward, "id" | "promo_codes">;
	orgId: string;
	env: AppEnv;
	excludeInternalId?: string;
}) => {
	const codes = reward.promo_codes.map(({ code }) => code);
	if (new Set(codes).size !== codes.length) {
		throw new RecaseError({
			message: "Promo codes must be unique within a reward",
			code: ErrCode.DuplicatePromoCode,
			statusCode: 400,
		});
	}

	const existingRewards = await rewardRepo.getByIdOrCode({
		db,
		codes: [reward.id, ...codes],
		orgId,
		env,
	});

	for (const existingReward of existingRewards) {
		if (existingReward.internal_id === excludeInternalId) continue;
		if (existingReward.id === reward.id) {
			throw new RecaseError({
				message: `Reward with id ${reward.id} already exists`,
				code: ErrCode.DuplicateRewardId,
				statusCode: 400,
			});
		}
		for (const promoCode of existingReward.promo_codes) {
			if (!codes.includes(promoCode.code)) continue;
			throw new RecaseError({
				message: `Promo code ${promoCode.code} is already in use by another reward`,
				code: ErrCode.DuplicatePromoCode,
				statusCode: 400,
			});
		}
	}
};
