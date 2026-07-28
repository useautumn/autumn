import { customerEntitlements, rollovers } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { batchResetCustomerEntitlementsV2 } from "@/internal/balances/batchReset/batchResetCustomerEntitlementsV2.js";

/** Reads a cusEnt row directly from Postgres — never triggers a lazy reset
 * (CusService.getFull would reset overdue rows as a side effect). */
export const fetchCustomerEntitlementRow = async ({
	db,
	customerEntitlementId,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
}) => {
	const rows = await db
		.select()
		.from(customerEntitlements)
		.where(eq(customerEntitlements.id, customerEntitlementId));
	if (rows.length === 0) {
		throw new Error(`cusEnt ${customerEntitlementId} not found`);
	}
	return rows[0];
};

export const fetchRollovers = async ({
	db,
	customerEntitlementId,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
}) =>
	db
		.select()
		.from(rollovers)
		.where(eq(rollovers.cus_ent_id, customerEntitlementId));

/** Runs the V2 batch reset worker exactly like the SQS consumer does. */
export const runBatchResetV2 = async ({
	ctx,
	customerEntitlementIds,
}: {
	ctx: TestContext;
	customerEntitlementIds: string[];
}) =>
	batchResetCustomerEntitlementsV2({
		db: ctx.db,
		logger,
		payload: { customerEntitlementIds },
	});

/**
 * Waits for a tracked deduction to land in Postgres. Redis-path track flushes
 * to PG lazily (SyncV4), so asserting/expiring before the flush would race.
 */
export const waitForPostgresBalance = async ({
	db,
	customerEntitlementId,
	expectedBalance,
	timeoutMs = 15_000,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
	expectedBalance: number;
	timeoutMs?: number;
}) => {
	const startedAt = Date.now();
	while (true) {
		const row = await fetchCustomerEntitlementRow({
			db,
			customerEntitlementId,
		});
		if (row.balance === expectedBalance) return row;
		if (Date.now() - startedAt > timeoutMs) {
			throw new Error(
				`cusEnt ${customerEntitlementId} balance never reached ${expectedBalance} (last: ${row.balance})`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
};
