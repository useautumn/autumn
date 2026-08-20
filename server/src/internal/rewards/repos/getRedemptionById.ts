import {
	type AppEnv,
	customers,
	ErrCode,
	RecaseError,
	type RewardRedemption,
	rewardPrograms,
	rewardRedemptions,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getRedemptionById = async ({
	db,
	id,
	orgId,
	env,
}: {
	db: DrizzleCli;
	id: string;
	orgId: string;
	env: AppEnv;
}) => {
	const [row] = await db
		.select({ redemption: rewardRedemptions })
		.from(rewardRedemptions)
		.leftJoin(
			customers,
			eq(customers.internal_id, rewardRedemptions.internal_customer_id),
		)
		.leftJoin(
			rewardPrograms,
			eq(
				rewardPrograms.internal_id,
				rewardRedemptions.internal_reward_program_id,
			),
		)
		.where(
			and(
				eq(rewardRedemptions.id, id),
				or(
					and(eq(customers.org_id, orgId), eq(customers.env, env)),
					and(eq(rewardPrograms.org_id, orgId), eq(rewardPrograms.env, env)),
				),
			),
		);

	if (!row) {
		throw new RecaseError({
			code: ErrCode.RewardRedemptionNotFound,
			message: `Reward redemption ${id} not found`,
			statusCode: 404,
		});
	}

	return row.redemption as RewardRedemption;
};
