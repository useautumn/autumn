import {
	type AppEnv,
	ErrCode,
	entitlements,
	RecaseError,
	type Reward,
	rewards,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type RewardWithEntitlementInputs,
	rewardToEntitlementRows,
} from "./rewardEntitlementRows.js";

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
	update: Partial<RewardWithEntitlementInputs>;
}) => {
	const { entitlements: entitlementInputs, ...rewardUpdate } = update;

	const result = await db
		.update(rewards)
		.set(rewardUpdate)
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

	if (entitlementInputs !== undefined) {
		await db
			.delete(entitlements)
			.where(eq(entitlements.internal_reward_id, internalId));

		const entitlementRows = rewardToEntitlementRows({
			reward: {
				internal_id: internalId,
				entitlements: entitlementInputs,
				org_id: orgId,
			},
		});

		if (entitlementRows.length > 0) {
			await db.insert(entitlements).values(entitlementRows);
		}

		return {
			...result[0],
			entitlements: entitlementRows,
		} as Reward;
	}

	return result[0] as Reward;
};
