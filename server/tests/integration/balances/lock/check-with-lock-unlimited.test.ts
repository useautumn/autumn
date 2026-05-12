/**
 * TDD test for lock + finalize on unlimited balance features.
 *
 * Contract under test:
 *   New behaviors:
 *     - check with lock=true on unlimited feature → allowed=true, lock receipt saved
 *     - finalize confirm on unlimited lock → success, receipt deleted
 *     - finalize release on unlimited lock → success, receipt deleted
 *   Side effects:
 *     - Lock receipt is saved to Redis with empty items for unlimited features
 *     - Lock receipt is cleaned up after finalize
 *
 * Pre-fix red: check with lock on unlimited skips lock receipt save entirely,
 *   so finalize throws "Lock not found for ID: ...".
 * Post-fix green: empty lock receipt is saved, finalize finds and deletes it.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeUnlimitedProd = () =>
	products.base({
		id: "unlimited",
		items: [items.unlimitedMessages()],
	});

// ── Contract assertion 1: check with lock on unlimited → allowed, finalize confirm → success ──
test.concurrent(`${chalk.yellowBright("lock-unlimited: check with lock on unlimited feature, finalize confirm succeeds")}`, async () => {
	const unlimitedProd = makeUnlimitedProd();
	const customerId = "lock-unlimited-confirm";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [unlimitedProd] }),
		],
		actions: [s.attach({ productId: unlimitedProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	const checkResponse = await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 10,
		lock: { enabled: true, lock_id: lockKey },
	});

	expect(checkResponse.allowed).toBe(true);

	const finalizeResponse = await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
	});

	expect(finalizeResponse.success).toBe(true);

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(customer).toBeDefined();
});

// ── Contract assertion 2: check with lock on unlimited → allowed, finalize release → success ──
test.concurrent(`${chalk.yellowBright("lock-unlimited: check with lock on unlimited feature, finalize release succeeds")}`, async () => {
	const unlimitedProd = makeUnlimitedProd();
	const customerId = "lock-unlimited-release";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [unlimitedProd] }),
		],
		actions: [s.attach({ productId: unlimitedProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	const checkResponse = await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: lockKey },
	});

	expect(checkResponse.allowed).toBe(true);

	const finalizeResponse = await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "release",
	});

	expect(finalizeResponse.success).toBe(true);

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });
});

// ── Contract assertion 3: check with lock=0 on unlimited, finalize confirm → success ──
test.concurrent(`${chalk.yellowBright("lock-unlimited: lock=0 on unlimited feature, finalize confirm succeeds")}`, async () => {
	const unlimitedProd = makeUnlimitedProd();
	const customerId = "lock-unlimited-zero";
	const lockKey = `${customerId}-lock`;

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [unlimitedProd] }),
		],
		actions: [s.attach({ productId: unlimitedProd.id })],
	});

	await deleteLock({ ctx, lockId: lockKey });

	const checkResponse = await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 0,
		lock: { enabled: true, lock_id: lockKey },
	});

	expect(checkResponse.allowed).toBe(true);

	const finalizeResponse = await autumnV2_1.balances.finalize({
		lock_id: lockKey,
		action: "confirm",
	});

	expect(finalizeResponse.success).toBe(true);

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });
});
