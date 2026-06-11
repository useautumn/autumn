import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { sql } from "drizzle-orm";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * Backdates a feature's usage-window counters in BOTH stores so the window is
 * wall-clock closed -- the windows analog of expireCusEntForReset. The next
 * subject read should lazily prune the rows.
 */
export const expireUsageWindowForReset = async ({
	ctx,
	customerId,
	featureId,
	shiftMs = THIRTY_FIVE_DAYS_MS,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
	shiftMs?: number;
}): Promise<void> => {
	await ctx.db.execute(sql`
		UPDATE usage_windows
		SET window_start_at = window_start_at - ${shiftMs},
			window_end_at = window_end_at - ${shiftMs}
		WHERE feature_id = ${featureId}
			AND internal_customer_id = (
				SELECT internal_id FROM customers
				WHERE id = ${customerId} AND org_id = ${ctx.org.id} AND env = ${ctx.env}
				LIMIT 1
			)
	`);

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
	});
	const rawWindows = await ctx.redisV2.hget(balanceKey, "_usage_windows");
	if (!rawWindows) return;

	// biome-ignore lint/suspicious/noExplicitAny: raw cached rows are untyped
	const backdated = (JSON.parse(rawWindows) as any[]).map((usageWindow) =>
		usageWindow.feature_id === featureId
			? {
					...usageWindow,
					window_start_at: Number(usageWindow.window_start_at) - shiftMs,
					window_end_at: Number(usageWindow.window_end_at) - shiftMs,
				}
			: usageWindow,
	);
	await ctx.redisV2.hset(
		balanceKey,
		"_usage_windows",
		JSON.stringify(backdated),
	);
};
