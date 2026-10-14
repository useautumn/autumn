/**
 * A lock with a caller-set expiry whose timer never fires: the sweep is the backstop `lockExpirySchedule.ts` names
 * ("the sweep picks up a lock whose timer was never created or never fired").
 *
 * Red (current): the sweep reads only locks that confirm on expiry, so the release lock stays held for good.
 * Green (after): the sweep releases it once due; its units come back and its lock_id is free.
 */

import { expect, test } from "bun:test";
import { balanceLocks } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { cancelLockExpirySchedule } from "@/internal/balances/balanceWorker/lockExpirySchedule.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { runLockSweepBatch } from "@/internal/balances/lockSweep/runLockSweepBatch.js";

// Only the worker writes balance_locks; legacy locks live in Redis and expire on their own path.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("lock-sweep-release: a release lock whose timer never fired is released by the sweep once due")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});
		const customerId = "lock-sweep-release-1";
		const { autumnV2_6, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});
		await deleteLock({ ctx, lockId: customerId });
		const thisLock = and(
			eq(balanceLocks.org_id, ctx.org.id),
			eq(balanceLocks.env, ctx.env),
			eq(balanceLocks.lock_id, customerId),
		);

		await autumnV2_6.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: {
				enabled: true,
				lock_id: customerId,
				expires_at: Date.now() + 3_600_000,
			},
		});
		// The timer is lost, as a failed CreateSchedule or a missed delivery loses it; then the lock falls due.
		await cancelLockExpirySchedule({ ctx, lockId: customerId });
		await ctx.db.update(balanceLocks).set({ expires_at: 1 }).where(thisLock);

		await runLockSweepBatch({ ctx });
		await flushBalanceWorkerCustomer({ ctx, customerId });

		expect(await ctx.db.select().from(balanceLocks).where(thisLock)).toEqual(
			[],
		);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 20,
		});
	},
	120_000,
);
