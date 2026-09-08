import { type UsageWindow, usageWindows } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const setUsageWindows = async ({
	db,
	windows,
}: {
	db: DrizzleCli;
	windows: Array<{ window: UsageWindow; usage: number }>;
}): Promise<void> => {
	if (windows.length === 0) return;

	await db.transaction(async (tx) => {
		for (const { window, usage } of windows) {
			const existing = await tx
				.select({ id: usageWindows.id })
				.from(usageWindows)
				.where(
					and(
						eq(usageWindows.internal_customer_id, window.internal_customer_id),
						eq(usageWindows.internal_feature_id, window.internal_feature_id),
						sql`coalesce(${usageWindows.internal_entity_id}, '') = coalesce(${window.internal_entity_id}, '')`,
						sql`coalesce(${usageWindows.filter_key}, '') = coalesce(${window.filter_key}, '')`,
					),
				)
				.for("update");

			if (existing[0]) {
				await tx
					.update(usageWindows)
					.set({ usage, updated_at: Date.now() })
					.where(eq(usageWindows.id, existing[0].id));
				continue;
			}

			await tx.insert(usageWindows).values({ ...window, usage });
		}
	});
};
