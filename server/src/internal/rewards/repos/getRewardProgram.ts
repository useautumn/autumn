import {
	ErrCode,
	RecaseError,
	type RewardProgram,
	rewardPrograms,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Fetch one reward program by ID or internal_id */
export const getRewardProgram = async ({
	db,
	idOrInternalId,
	orgId,
	env,
	errorIfNotFound = false,
}: {
	db: DrizzleCli;
	idOrInternalId: string;
	orgId: string;
	env: string;
	errorIfNotFound?: boolean;
}) => {
	const result = await db.query.rewardPrograms.findFirst({
		where: and(
			or(
				eq(rewardPrograms.id, idOrInternalId),
				eq(rewardPrograms.internal_id, idOrInternalId),
			),
			eq(rewardPrograms.org_id, orgId),
			eq(rewardPrograms.env, env),
		),
	});

	if (!result) {
		if (errorIfNotFound) {
			throw new RecaseError({
				message: "Reward program not found",
				code: ErrCode.RewardNotFound,
			});
		}
		return null;
	}

	return result as RewardProgram;
};
