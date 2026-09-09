import { type UsageWindow, usageWindows } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const setUsageWindows = async ({
	db,
	windows,
}: {
	db: DrizzleCli;
	windows: UsageWindow[];
}): Promise<void> => {
	for (const window of windows) {
		await db.execute(sql`
   INSERT INTO ${usageWindows} (
    id, internal_customer_id, internal_feature_id, internal_entity_id,
    feature_id, filter_key, anchor_customer_entitlement_id,
    window_start_at, window_end_at, usage, updated_at
   ) VALUES (
    ${window.id}, ${window.internal_customer_id}, ${window.internal_feature_id},
    ${window.internal_entity_id}, ${window.feature_id}, ${window.filter_key},
    ${window.anchor_customer_entitlement_id}, ${window.window_start_at},
    ${window.window_end_at}, ${window.usage}, ${Date.now()}
   )
   ON CONFLICT (internal_customer_id, internal_feature_id,
    (COALESCE(internal_entity_id, '')), (COALESCE(filter_key, '')))
   DO UPDATE SET usage = EXCLUDED.usage, updated_at = EXCLUDED.updated_at
  `);
	}
};
