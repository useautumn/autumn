import {
	ErrCode,
	RecaseError,
	type ReferralCode,
	referralCodes,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Insert a referral code. Throws on failure. */
export const insertReferralCode = async ({
	db,
	data,
}: {
	db: DrizzleCli;
	data: ReferralCode;
}) => {
	const result = await db.insert(referralCodes).values(data).returning();

	if (result.length === 0) {
		throw new RecaseError({
			message: "Failed to create referral code",
			code: ErrCode.InsertReferralCodeFailed,
		});
	}

	return result[0] as ReferralCode;
};
