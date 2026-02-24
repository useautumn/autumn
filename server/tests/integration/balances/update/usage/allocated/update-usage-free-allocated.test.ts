import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-FREE-ALLOC1: Set usage on free allocated feature
// freeAllocatedUsers: ContinuousUse, no price, 5 included seats
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-free-alloc1: basic usage on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-free-alloc1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 3: targetBalance = 5 + 0 - 3 = 2
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 3,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 2,
		purchased_balance: 0,
		usage: 3,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 2,
		purchased_balance: 0,
		usage: 3,
	});
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-FREE-ALLOC2: Set usage beyond included on free allocated (overage)
// Overage absorbed into purchased_balance
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("update-usage-free-alloc2: overage on free allocated")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 5 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-free-alloc2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Set usage to 8: targetBalance = 5 + 0 - 8 = -3
	// Overage absorbed into purchased_balance
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 8,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});

	// Verify DB sync
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 5,
		current_balance: 0,
		purchased_balance: 3,
		usage: 8,
	});
});
