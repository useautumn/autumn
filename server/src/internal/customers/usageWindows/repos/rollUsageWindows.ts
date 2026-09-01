import { type AppEnv, usageWindows } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { UsageWindowRoll } from "@/internal/customers/actions/resetUsageWindows/computeUsageWindowRolls.js";

/**
 * Rolls counter rows in place: advances bounds/anchor to the current
 * derivation; zeroes the count only when its stored window closed (a
 * bounds-only re-alignment, e.g. after a plan change, keeps the count).
 */
export const rollUsageWindows = async ({
	db,
	rolls,
	now,
	orgId,
	env,
	customerId,
}: {
	db: DrizzleCli;
	rolls: UsageWindowRoll[];
	now: number;
	orgId: string;
	env: AppEnv;
	customerId: string;
}): Promise<boolean> => {
	const lockKey = `usage-window-roll:${orgId}:${env}:${customerId}`;

	return db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const lockResult = await txDb.execute<{ acquired: boolean }>(
			sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS acquired`,
		);
		if (!lockResult[0]?.acquired) return false;

		for (const roll of rolls) {
			await txDb
				.update(usageWindows)
				.set({
					usage: roll.zero_usage ? 0 : sql`${usageWindows.usage}`,
					window_start_at: roll.window_start_at,
					window_end_at: roll.window_end_at,
					anchor_customer_entitlement_id: roll.anchor_customer_entitlement_id,
					updated_at: now,
				})
				.where(eq(usageWindows.id, roll.id));
		}

		return true;
	});
};
