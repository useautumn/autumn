import {
	type AppEnv,
	ErrCode,
	RecaseError,
	type Reward,
	rewards,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Update a reward by internal_id. Throws if not found. */
export const updateReward = async ({
	db,
	internalId,
	env,
	orgId,
	update,
}: {
	db: DrizzleCli;
	internalId: string;
	env: AppEnv;
	orgId: string;
	update: Partial<Reward>;
}) => {
	const result = await db
		.update(rewards)
		.set(update)
		.where(
			and(
				eq(rewards.internal_id, internalId),
				eq(rewards.env, env),
				eq(rewards.org_id, orgId),
			),
		)
		.returning();

	if (result.length === 0) {
		throw new RecaseError({
			message: `Reward ${internalId} not found`,
			code: ErrCode.InvalidRequest,
		});
	}

	return result[0] as Reward;
};
