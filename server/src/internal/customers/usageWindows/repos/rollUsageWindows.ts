import { usageWindows } from "@autumn/shared";
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
}: {
	db: DrizzleCli;
	rolls: UsageWindowRoll[];
	now: number;
}): Promise<void> => {
	for (const roll of rolls) {
		await db
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
};
