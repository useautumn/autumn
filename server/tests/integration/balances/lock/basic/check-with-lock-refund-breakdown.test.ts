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

// Product: hourlyMessages(5) + lifetimeMessages(20) = 25 total

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 20 });
	return products.base({
		id: "free",
		items: [hourlyMessages, lifetimeMessages],
	});
};

// ─────────────────────────────────────────────────────────────────────────────
// BD-1: lock=8, confirm=5 → hourly=0, lifetime=20
// Deduct 8 from hourly first (5), then lifetime (3). Confirm 5, unwind 3 from lifetime.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund BD-1: lock=8 confirm=5 — unwind 3 from lifetime bucket")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-1";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_key: customerId,
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

// ─────────────────────────────────────────────────────────────────────────────
// BD-2: lock=8, confirm=0 → hourly=5, lifetime=20
// Full release: unwind all 8 (3 from lifetime, 5 from hourly)
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund BD-2: lock=8 confirm=0 — full release, both buckets restored")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_key: customerId,
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

// ─────────────────────────────────────────────────────────────────────────────
// BD-3: lock=5, confirm=3 → hourly=2, lifetime=20
// Lock=5, only deducts from hourly (5). Confirm=3, unwind 2 from hourly only.
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund BD-3: lock=5 confirm=3 — unwind stays within hourly bucket")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-3";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 5,
		lock: { enabled: true, key: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_key: customerId,
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

	await expectLockReceiptDeleted({ ctx, lockKey: customerId });
});

// ─────────────────────────────────────────────────────────────────────────────
// BD-4: lock=8, confirm=8 → hourly=0, lifetime=17
// finalValue == lockValue → early exit, no deduction step, no finalize event.
// Only 1 event: the original check track (value=8).
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("refund BD-4: lock=8 confirm=8 — no unwind, lifetime bucket reduced")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-breakdown-4";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_key: customerId,
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

	// finalValue == lockValue → early exit, no finalize event emitted; only 1 event (check track)
	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: 8 }],
	});
});
