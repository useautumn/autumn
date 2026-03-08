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

test.concurrent(`${chalk.yellowBright("check-with-lock-basic: /check with lock basic")}`, async () => {
	const lockKey = "test-lock";
	const hourlyMessages = items.hourlyMessages({ includedUsage: 5 });
	const monthlyMessages = items.monthlyMessages({ includedUsage: 10 });
	const freeProd = products.base({
		id: "free",
		items: [hourlyMessages, monthlyMessages],
	});

	const { customerId, autumnV2, ctx } = await initScenario({
		customerId: "check-no-feature",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

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
	});

	// Release lock
	await autumnV2.balances.finalize({
		finalize_action: "confirm",
		overwrite_value: 4,
		lock_key: lockKey,
	});

	const customer = await autumnV2.customers.get<ApiCustomerV5>(customerId);

	console.log("Message balance:", customer.balances[TestFeature.Messages]);
});
