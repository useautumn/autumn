import { test } from "bun:test";
import { type ApiCustomerV5, ResetInterval } from "@autumn/shared";
import { expectCustomerEventsCorrect } from "@tests/integration/balances/utils/events/expectCustomerEventsCorrect.js";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Product: hourlyMessages(5) + monthlyMessages(10) = 15 total

const makeFreeProd = () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	return products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});
};

// ─────────────────────────────────────────────────────────────────────────────
// RL-1: lock=8, release → remaining=15
// Full unwind regardless of lock amount — balance fully restored
// Events: finalize delta = 0-8 = -8, track = 8
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("release RL-1: lock=8 release — full restore, remaining=15")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-release-1";

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
		action: "release",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 15,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -8 }, { value: 8 }],
	});

	const customerDb = await autumnV2_1.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: customerDb,
		featureId: TestFeature.Messages,
		remaining: 15,
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RL-2: track=5, lock=8, release → remaining=10
// Prior usage is preserved; only the lock deduction is unwound
// Events: finalize delta = 0-8 = -8, track = 8, track = 5
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("release RL-2: track=5 lock=8 release — prior usage kept, remaining=10")}`, async () => {
	const freeProd = makeFreeProd();
	const customerId = "lock-release-2";

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await deleteLock({ ctx, lockKey: customerId });

	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 5,
	});

	await autumnV2_1.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, key: customerId },
	});

	await autumnV2_1.balances.finalize({
		lock_key: customerId,
		action: "release",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 10,
	});

	await expectCustomerEventsCorrect({
		customerId,
		events: [{ value: -8 }, { value: 8 }, { value: 5 }],
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// RL-3: lock=8 spanning hourly+lifetime buckets, release → both fully restored
// Deducts 5 from hourly, 3 from lifetime. Release unwinds both.
// Product: hourlyMessages(5) + lifetimeMessages(20) = 25 total
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("release RL-3: lock=8 cross-bucket release — both buckets fully restored")}`, async () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const lifetimeMessages = items.lifetimeMessages({ includedUsage: 20 });
	const freeProd = products.base({
		id: "free",
		items: [hourlyMessages, lifetimeMessages],
	});

	const customerId = "lock-release-4";

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
		action: "release",
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
