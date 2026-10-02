import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	type BalanceAllocations,
	customers,
	isSameUsageWindow,
	usageWindows,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Runs `fn` holding the customer row lock, so allocation writers never interleave. */
export const withAllocationLock = async <T>({
	ctx,
	tx,
	internalCustomerId,
	fn,
}: {
	ctx: AutumnContext;
	tx?: DrizzleCli;
	internalCustomerId: string;
	fn: (params: {
		tx: DrizzleCli;
		allocations: BalanceAllocations | null;
	}) => Promise<T>;
}): Promise<T> => {
	const runLocked = async ({ tx }: { tx: DrizzleCli }): Promise<T> => {
		const [row] = await tx
			.select({ balanceAllocations: customers.balance_allocations })
			.from(customers)
			.where(
				and(
					eq(customers.internal_id, internalCustomerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			)
			.for("update");
		const allocations = row?.balanceAllocations;
		return fn({
			tx,
			allocations:
				allocations && Object.keys(allocations).length > 0 ? allocations : null,
		});
	};
	if (tx) return runLocked({ tx });
	return ctx.db.transaction((transaction) =>
		runLocked({ tx: transaction as unknown as DrizzleCli }),
	);
};

export const writeAllocations = async ({
	ctx,
	tx,
	internalCustomerId,
	allocations,
}: {
	ctx: AutumnContext;
	tx: DrizzleCli;
	internalCustomerId: string;
	allocations: BalanceAllocations;
}) => {
	await tx
		.update(customers)
		.set({ balance_allocations: allocations })
		.where(
			and(
				eq(customers.internal_id, internalCustomerId),
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
			),
		);
};

/** Live counter usage for one feature's cycle, read under the lock; the claimed total sits under "". */
export const readAllocationCounters = async ({
	tx,
	internalCustomerId,
	internalFeatureId,
	cycle,
}: {
	tx: DrizzleCli;
	internalCustomerId: string;
	internalFeatureId: string;
	cycle: { windowStartAt: number; windowEndAt: number };
}): Promise<Record<string, number>> => {
	const rows = await tx
		.select()
		.from(usageWindows)
		.where(
			and(
				eq(usageWindows.internal_customer_id, internalCustomerId),
				eq(usageWindows.internal_feature_id, internalFeatureId),
				eq(usageWindows.filter_key, ALLOCATION_USAGE_WINDOW_FILTER_KEY),
			),
		);
	const usage: Record<string, number> = {};
	for (const row of rows) {
		if (
			!isSameUsageWindow({
				usageWindow: row,
				window: {
					window_start_at: cycle.windowStartAt,
					window_end_at: cycle.windowEndAt,
				},
			})
		)
			continue;
		usage[row.internal_entity_id ?? ""] = Number(row.usage);
	}
	return usage;
};
