import {
	ErrCode,
	RecaseError,
	type RewardProgram,
	rewardPrograms,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Update a reward program. Throws if not found. */
export const updateRewardProgram = async ({
	db,
	idOrInternalId,
	orgId,
	env,
	data,
}: {
	db: DrizzleCli;
	idOrInternalId: string;
	orgId: string;
	env: string;
	data: Partial<RewardProgram>;
}) => {
	const result = await db
		.update(rewardPrograms)
		.set(data)
		.where(
			and(
				or(
					eq(rewardPrograms.id, idOrInternalId),
					eq(rewardPrograms.internal_id, idOrInternalId),
				),
				eq(rewardPrograms.org_id, orgId),
				eq(rewardPrograms.env, env),
			),
		)
		.returning();

	if (result.length === 0) {
		throw new RecaseError({
			message: "Reward program not found",
			code: ErrCode.RewardNotFound,
		});
	}

	return result[0] as RewardProgram;
};
