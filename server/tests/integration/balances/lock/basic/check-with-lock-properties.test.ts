import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
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

const lockProperties = { requestId: "req_123", model: "gpt-5" };

// ─────────────────────────────────────────────────────────────────────────────
// PR-1: lock=8 with properties, confirm=5 without properties
// The finalize delta event inherits the properties saved on the lock receipt
// Events: finalize delta = 5-8 = -3, track = 8
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("properties PR-1: finalize without properties inherits the lock's")}`,
	async () => {
		const freeProd = makeFreeProd();
		const customerId = "lock-properties-1";

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 8,
			lock: { enabled: true, lock_id: customerId },
			properties: lockProperties,
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
			remaining: 10,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [
				{ value: -3, properties: lockProperties },
				{ value: 8, properties: lockProperties },
			],
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────
// PR-2: lock=8 with properties, confirm=5 with its own properties
// An explicit finalize payload wins over the lock's saved properties
// ─────────────────────────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("properties PR-2: finalize properties override the lock's")}`,
	async () => {
		const freeProd = makeFreeProd();
		const customerId = "lock-properties-2";
		const finalizeProperties = { requestId: "req_456", outcome: "success" };

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await deleteLock({ ctx, lockId: customerId });

		await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 8,
			lock: { enabled: true, lock_id: customerId },
			properties: lockProperties,
		});

		await autumnV2_1.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 5,
			properties: finalizeProperties,
		});

		await expectCustomerEventsCorrect({
			customerId,
			events: [
				{ value: -3, properties: finalizeProperties },
				{ value: 8, properties: lockProperties },
			],
		});
	},
);
