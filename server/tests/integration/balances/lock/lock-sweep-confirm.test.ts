import { expect, test } from "bun:test";
import { type ApiCustomerV5, balanceLocks } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runLockSweepBatch } from "@/internal/balances/lockSweep/runLockSweepBatch.js";

test(`${chalk.yellowBright("lock-sweep-confirm: a lock past its 24 hour default is confirmed, and its id is free again")}`, async () => {
	const freeProd = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});
	const customerId = "lock-sweep-confirm-1";
	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});
	await deleteLock({ ctx, lockId: customerId });

	const takeLock = () =>
		autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 5,
			lock: { enabled: true, lock_id: customerId },
		});
	const thisLock = and(
		eq(balanceLocks.org_id, ctx.org.id),
		eq(balanceLocks.env, ctx.env),
		eq(balanceLocks.lock_id, customerId),
	);

	await takeLock();
	// Age the lock past its expiry rather than waiting a day for it.
	await ctx.db.update(balanceLocks).set({ expires_at: 1 }).where(thisLock);

	await runLockSweepBatch({ ctx });

	expect(await ctx.db.select().from(balanceLocks).where(thisLock)).toEqual([]);
	// Confirmed, not released: the 5 the lock took stay taken.
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
	// The worker forgot the id too, so the same lock id can be taken again.
	await takeLock();
});
