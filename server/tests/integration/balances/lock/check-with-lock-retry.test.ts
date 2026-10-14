/**
 * D2, the API's check with a lock retried under the same lock_id while the lock is open:
 *  1. on the same terms → 200 allowed, answered as the first was; one balance_locks row, the balance deducted once;
 *  2. on other terms → 409 lock_already_exists, "lock_id already used with different terms", nothing moves;
 *  3. two retries at once → both allowed, still one row.
 */

import { expect, test } from "bun:test";
import { balanceLocks, ErrCode } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

/** A customer with 10 monthly messages and an 8-message lock under `lockId`, and a way to ask for it again. */
const initLocked = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});
	await deleteLock({ ctx, lockId: customerId });
	const checkWithLock = ({
		requiredBalance = 8,
	}: {
		requiredBalance?: number;
	} = {}) =>
		autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: requiredBalance,
			lock: { enabled: true, lock_id: customerId },
		});
	const countLockRows = async () =>
		(
			await ctx.db
				.select({ id: balanceLocks.id })
				.from(balanceLocks)
				.where(
					and(
						eq(balanceLocks.org_id, ctx.org.id),
						eq(balanceLocks.env, ctx.env),
						eq(balanceLocks.lock_id, customerId),
					),
				)
		).length;
	return { checkWithLock, countLockRows, first: await checkWithLock() };
};

// Only the worker holds the lock's terms; the legacy Redis path keeps refusing any reuse.
test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("check-with-lock-retry1: the same lock_id on the same terms is allowed again: one row, deducted once")}`,
	async () => {
		const customerId = "check-with-lock-retry1";
		const { checkWithLock, countLockRows, first } = await initLocked({
			customerId,
		});

		const retried = await checkWithLock();

		expect(retried).toMatchObject({
			allowed: true,
			required_balance: first.required_balance,
		});
		expect(retried.balance).toEqual(first.balance);
		expect(await countLockRows()).toBe(1);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});
	},
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("check-with-lock-retry2: the same lock_id on other terms is 409, and nothing moves")}`,
	async () => {
		const customerId = "check-with-lock-retry2";
		const { checkWithLock, countLockRows } = await initLocked({ customerId });

		await expectAutumnError({
			errCode: ErrCode.LockAlreadyExists,
			errMessage: "lock_id already used with different terms",
			func: () => checkWithLock({ requiredBalance: 9 }),
		});

		expect(await countLockRows()).toBe(1);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});
	},
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("check-with-lock-retry3: two retries at once are both allowed, and there is still one row")}`,
	async () => {
		const customerId = "check-with-lock-retry3";
		const { checkWithLock, countLockRows } = await initLocked({ customerId });

		const retries = await Promise.all([checkWithLock(), checkWithLock()]);

		expect(retries.map(({ allowed }) => allowed)).toEqual([true, true]);
		expect(await countLockRows()).toBe(1);
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});
	},
);
