import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// CHECK: No feature attached
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("check-with-lock-postgres: /check with lock postgres")}`, async () => {
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	const freeProd = products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "check-with-lock-postgres",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const lockKey = customerId;

	await deleteLock({
		ctx,
		lockKey,
	});

	const firstResult = await autumnV2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: {
			enabled: true,
			key: lockKey,
		},
		skip_cache: true,
	});

	// Release lock
	await autumnV2.balances.finalize(
		{
			finalize_action: "confirm",
			overwrite_value: 12,
			lock_key: lockKey,
		},
		{
			skipCache: true,
		},
	);

	const customer = await autumnV2.customers.get<ApiCustomerV5>(customerId);

	console.log("Message balance:", customer.balances[TestFeature.Messages]);
});
