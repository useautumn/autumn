import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

const makeUnlimitedProd = () =>
	products.base({
		id: "unlimited",
		items: [items.unlimitedMessages()],
	});

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
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 10 }],
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expect(customer).toBeDefined();
});

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

	await timeout(4000);

	await expectLockReceiptDeleted({ ctx, lockId: lockKey });
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -5 }, { value: 5 }],
	});
});

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
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 0 }],
	});
});
