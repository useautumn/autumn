import {
	customerEntitlements,
	InternalError,
	type NormalizedFullSubject,
	rollovers,
	usageWindows,
} from "@autumn/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const persistAttachBalanceHandoffRuntime = async ({
	ctx,
	source,
	target,
	allowedCacheVersionsById,
	rolloverIdsToDelete = [],
}: {
	ctx: AutumnContext;
	source: NormalizedFullSubject;
	target: NormalizedFullSubject;
	allowedCacheVersionsById: Map<string, number[]>;
	rolloverIdsToDelete?: string[];
}): Promise<void> => {
	const balanceById = new Map(
		[...source.customer_entitlements, ...target.customer_entitlements].map(
			(subjectBalance) => [subjectBalance.id, subjectBalance],
		),
	);
	const rolloverById = new Map(
		[...balanceById.values()]
			.flatMap((subjectBalance) => subjectBalance.rollovers)
			.map((rollover) => [rollover.id, rollover]),
	);
	const usageWindowById = new Map(
		[...source.usage_windows, ...target.usage_windows].map((usageWindow) => [
			usageWindow.id,
			usageWindow,
		]),
	);

	await ctx.db.transaction(async (transaction) => {
		const db = transaction as unknown as DrizzleCli;
		for (const subjectBalance of balanceById.values()) {
			const allowedCacheVersions = allowedCacheVersionsById.get(
				subjectBalance.id,
			);
			if (!allowedCacheVersions || allowedCacheVersions.length === 0) {
				throw new InternalError({
					message: `Missing cache-version fence for '${subjectBalance.id}'`,
					code: "balance_handoff_cache_version_missing",
				});
			}

			const updated = await db
				.update(customerEntitlements)
				.set({
					balance: subjectBalance.balance,
					additional_balance: subjectBalance.additional_balance,
					adjustment: subjectBalance.adjustment,
					entities: subjectBalance.entities,
					cache_version: subjectBalance.cache_version ?? 0,
				})
				.where(
					and(
						eq(customerEntitlements.id, subjectBalance.id),
						inArray(
							sql<number>`COALESCE(${customerEntitlements.cache_version}, 0)`,
							allowedCacheVersions,
						),
					),
				)
				.returning({ id: customerEntitlements.id });
			if (updated.length !== 1) {
				throw new InternalError({
					message: `Balance '${subjectBalance.id}' changed during attach handoff`,
					code: "balance_handoff_cache_version_changed",
				});
			}
		}

		if (rolloverIdsToDelete.length > 0) {
			await db
				.delete(rollovers)
				.where(inArray(rollovers.id, rolloverIdsToDelete));
		}

		if (rolloverById.size > 0) {
			await db
				.insert(rollovers)
				.values([...rolloverById.values()])
				.onConflictDoUpdate({
					target: rollovers.id,
					set: {
						balance: sql.raw("excluded.balance"),
						usage: sql.raw("excluded.usage"),
						entities: sql.raw("excluded.entities"),
					},
				});
		}

		if (usageWindowById.size > 0) {
			await db
				.insert(usageWindows)
				.values([...usageWindowById.values()])
				.onConflictDoUpdate({
					target: usageWindows.id,
					set: {
						window_start_at: sql.raw("excluded.window_start_at"),
						window_end_at: sql.raw("excluded.window_end_at"),
						usage: sql.raw("excluded.usage"),
						updated_at: sql.raw("excluded.updated_at"),
					},
				});
		}
	});
};
