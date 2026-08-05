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
		const existingIdentifiers = new Set([
			existingReward.id,
			existingReward.internal_id,
			...existingReward.promo_codes.map(({ code }) => code),
		]);
		if (existingIdentifiers.has(reward.id)) {
			throw new RecaseError({
				message: `Reward id ${reward.id} is already in use`,
				code: ErrCode.DuplicateRewardId,
				statusCode: 400,
			});
		}
		const takenCode = codes.find((code) => existingIdentifiers.has(code));
		if (takenCode) {
			throw new RecaseError({
				message: `Promo code ${takenCode} is already in use by another reward`,
				code: ErrCode.DuplicatePromoCode,
				statusCode: 400,
			});
		}
	}
};
