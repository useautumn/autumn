import {
	USAGE_WINDOW_BOUND_TOLERANCE_MS,
	type UsageWindow,
	usageWindows,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * Moves allocation counters to `usage`, given the `readUsage` the caller computed from: a live counter gets the
 * difference added, so a deduction that landed since the read is kept; a counter from a past cycle is replaced.
 */
export const setAllocationCounters = async ({
	db,
	counters,
}: {
	db: DrizzleCli;
	counters: (UsageWindow & { readUsage: number })[];
}): Promise<void> => {
	for (const counter of counters) {
		await db.execute(sql`
   INSERT INTO ${usageWindows} (
    id, internal_customer_id, internal_feature_id, internal_entity_id,
    feature_id, filter_key, anchor_customer_entitlement_id,
    window_start_at, window_end_at, usage, updated_at
   ) VALUES (
    ${counter.id}, ${counter.internal_customer_id}, ${counter.internal_feature_id},
    ${counter.internal_entity_id}, ${counter.feature_id}, ${counter.filter_key},
    ${counter.anchor_customer_entitlement_id}, ${counter.window_start_at},
    ${counter.window_end_at}, ${counter.usage}, ${counter.updated_at}
   )
   ON CONFLICT (internal_customer_id, internal_feature_id,
    (COALESCE(internal_entity_id, '')), (COALESCE(filter_key, '')))
   DO UPDATE SET
    usage = CASE
     WHEN ABS(${usageWindows}.window_start_at - EXCLUDED.window_start_at) <= ${USAGE_WINDOW_BOUND_TOLERANCE_MS}
      AND ABS(${usageWindows}.window_end_at - EXCLUDED.window_end_at) <= ${USAGE_WINDOW_BOUND_TOLERANCE_MS}
     THEN GREATEST(0, ${usageWindows}.usage + (EXCLUDED.usage - ${counter.readUsage}))
     ELSE EXCLUDED.usage
    END,
    window_start_at = EXCLUDED.window_start_at,
    window_end_at = EXCLUDED.window_end_at,
    anchor_customer_entitlement_id = EXCLUDED.anchor_customer_entitlement_id,
    updated_at = EXCLUDED.updated_at
  `);
	}
};
