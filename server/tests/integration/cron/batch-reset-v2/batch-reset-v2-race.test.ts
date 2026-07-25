/**
 * TDD test for the V2 batch reset optimistic guard.
 *
 * Contract under test:
 *   Behaviors:
 *     - a mutation computed BEFORE a concurrent reset committed (the lazy
 *       reset racing the worker, or a duplicate delivery) is SKIPPED by the
 *       guarded execute UPDATE: balance written by the winner survives,
 *       next_reset_at is not pushed another cycle, and NO duplicate rollover
 *       row is inserted
 *     - the skip is reported (staleSkippedCount) and non-applied mutations
 *       produce no rollover writes
 *
 * The race is simulated by running the worker's stages directly: hydrate +
 * classify + compute, then committing a "lazy reset" (row update + rollover
 * insert) before executeResetMutations runs with the now-stale mutations.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";
import { logger } from "@/external/logtail/logtailUtils.js";
import { classifyBatchResetContext } from "@/internal/balances/batchReset/compute/classifyBatchResetContext.js";
import { computeResetMutations } from "@/internal/balances/batchReset/compute/computeResets/computeResetMutations.js";
import { executeResetMutations } from "@/internal/balances/batchReset/execute/executeResetMutations.js";
import { setupBatchResetContext } from "@/internal/balances/batchReset/setup/setupBatchResetContext.js";
import {
	fetchCustomerEntitlementRow,
	fetchRollovers,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 race: stale mutation is skipped after a concurrent reset wins")}`,
	async () => {
		const customerId = "batch-reset-v2-race-lazy-wins";
		const plan = products.base({
			id: "race-lazy-wins",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: INCLUDED_USAGE,
					rolloverConfig: {
						max: 1000,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					},
				}),
			],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		// ── Worker stages 1-3: hydrate, classify, compute ────────────────
		const batchResetContext = await setupBatchResetContext({
			db: ctx.db,
			logger,
			payload: { customerEntitlementIds: [customerEntitlement!.id] },
		});
		const classified = classifyBatchResetContext({ batchResetContext });
		const resetMutations = await computeResetMutations({
			resetGroups: classified.resetGroups,
		});
		expect(resetMutations.length).toBe(1);
		const computedNextResetAt = resetMutations[0].updates.next_reset_at;

		// ── Concurrent "lazy reset" commits first: same reset target, its
		// own rollover row, then some fresh usage (balance 95) ───────────
		await ctx.db.execute(sql`
			INSERT INTO rollovers (id, cus_ent_id, balance, usage, expires_at, entities)
			VALUES ('roll_race_lazy_winner', ${customerEntitlement!.id}, 100, 0, null, '{}'::jsonb)
		`);
		await ctx.db
			.update(customerEntitlements)
			.set({ balance: 95, next_reset_at: computedNextResetAt })
			.where(eq(customerEntitlements.id, customerEntitlement!.id));

		// ── Worker stage 4: execute with the now-stale mutations ─────────
		const { appliedCustomerEntitlementIds, staleSkippedCount } =
			await executeResetMutations({ db: ctx.db, resetMutations });

		// ── Contract: the stale mutation is skipped, not double-applied ──
		expect(staleSkippedCount).toBe(1);
		expect(appliedCustomerEntitlementIds.size).toBe(0);

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		// The winner's post-reset usage survives (no balance re-top).
		expect(row.balance).toBe(95);
		// next_reset_at not pushed another cycle forward.
		expect(row.next_reset_at).toBe(computedNextResetAt);

		// ── Contract: exactly ONE rollover row (the winner's) ────────────
		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].id).toBe("roll_race_lazy_winner");
	},
);
