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
	/** Nullable columns take an explicit null to clear; undefined leaves them. */
	data: Partial<
		Omit<RewardProgram, "product_ids" | "max_redemptions" | "exclude_trial">
	> & {
		product_ids?: string[] | null;
		max_redemptions?: number | null;
		exclude_trial?: boolean | null;
	};
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
			statusCode: 404,
		});
	}

	return result[0] as RewardProgram;
};
