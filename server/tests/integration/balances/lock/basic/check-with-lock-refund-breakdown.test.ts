import { test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectLockReceiptDeleted } from "@tests/integration/balances/utils/lockUtils/expectLockReceiptDeleted.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 20 });
	return products.base({
		id: "free",
		items: [hourlyMessages, lifetimeMessages],
	});
};

test.concurrent(`${chalk.yellowBright("refund BD-1: lock=8 confirm=5 — unwind 3 from lifetime bucket")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-1";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 5,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 20,
		breakdown: {
			[ResetInterval.Hour]: { included_grant: 5, remaining: 0 },
			[ResetInterval.OneOff]: { included_grant: 20, remaining: 20 },
		},
	});
});

test.concurrent(`${chalk.yellowBright("refund BD-2: lock=8 confirm=0 — full release, both buckets restored")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 0,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 25,
		breakdown: {
			[ResetInterval.Hour]: { included_grant: 5, remaining: 5 },
			[ResetInterval.OneOff]: { included_grant: 20, remaining: 20 },
		},
	});
});

test.concurrent(`${chalk.yellowBright("refund BD-2b: lock=0 confirm=0 — zero-cost receipt finalizes cleanly")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-2b";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 0,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 25,
		breakdown: {
			[ResetInterval.Hour]: { included_grant: 5, remaining: 5 },
			[ResetInterval.OneOff]: { included_grant: 20, remaining: 20 },
		},
	});

	await expectLockReceiptDeleted({ ctx, lockId: customerId });
});

test.concurrent(`${chalk.yellowBright("refund BD-3: lock=5 confirm=3 — unwind stays within hourly bucket")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 3,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 22,
		breakdown: {
			[ResetInterval.Hour]: { included_grant: 5, remaining: 2 },
			[ResetInterval.OneOff]: { included_grant: 20, remaining: 20 },
		},
	});

	await expectLockReceiptDeleted({ ctx, lockId: customerId });
});

test.concurrent(`${chalk.yellowBright("refund BD-4: lock=8 confirm=8 — no unwind, lifetime bucket reduced")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockId: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_id: customerId,
		action: "confirm",
		override_value: 8,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 17,
		breakdown: {
			[ResetInterval.Hour]: { included_grant: 5, remaining: 0 },
			[ResetInterval.OneOff]: { included_grant: 20, remaining: 17 },
		},
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 8 }],
	});
});
