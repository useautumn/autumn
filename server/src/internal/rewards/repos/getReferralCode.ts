import {
	ErrCode,
	RecaseError,
	type ReferralCode,
	type Reward,
	type RewardProgram,
	referralCodes,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch a referral code by string value, optionally with reward program + reward */
export const getReferralCode = async ({
	db,
	orgId,
	env,
	code,
	withRewardProgram = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	code: string;
	withRewardProgram?: boolean;
}) => {
	const result = await db.query.referralCodes.findFirst({
		where: and(
			eq(referralCodes.code, code),
			eq(referralCodes.org_id, orgId),
			eq(referralCodes.env, env),
		),
		with: withRewardProgram
			? {
					reward_program: {
						with: {
							reward: true,
						},
					},
				}
			: undefined,
	});

	if (!result) {
		throw new RecaseError({
			message: "Referral code not found",
			code: ErrCode.ReferralCodeNotFound,
			statusCode: 404,
		});
	}

	return result as ReferralCode & {
		reward_program: RewardProgram & {
			reward: Reward;
		};
	};
};
