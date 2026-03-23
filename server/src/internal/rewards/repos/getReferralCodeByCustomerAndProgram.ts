import { type ReferralCode, referralCodes } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Find a referral code for a specific customer + reward program */
export const getReferralCodeByCustomerAndProgram = async ({
	db,
	orgId,
	env,
	internalCustomerId,
	internalRewardProgramId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	internalCustomerId: string;
	internalRewardProgramId: string;
}) => {
	const result = await db.query.referralCodes.findFirst({
		where: and(
			eq(referralCodes.internal_customer_id, internalCustomerId),
			eq(referralCodes.internal_reward_program_id, internalRewardProgramId),
			eq(referralCodes.org_id, orgId),
			eq(referralCodes.env, env),
		),
	});

	if (!result) {
		return null;
	}

	return result as ReferralCode;
};
