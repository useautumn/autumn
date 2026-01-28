import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Test: Attach pro plan with prepaid allocated users, then track concurrently
 */
test.concurrent(`${chalk.yellowBright("prepaid-users: attach 50 users then track concurrently")}`, async () => {
	const prepaidUsersItem = items.prepaidUsers({
		includedUsage: 0,
		billingUnits: 1,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidUsersItem],
	});

	const customerId = "prepaid-allocated-users-concurrent";
	const { autumnV2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: 50 }],
			}),
		],
	});

	// Verify initial state: 50 prepaid users
	const customerBefore = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerBefore.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 0,
		purchased_balance: 50,
		current_balance: 50,
		usage: 0,
	});

	// Track 10 times concurrently - each adding 1 user
	const trackPromises = Array.from({ length: 10 }, (_, i) =>
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
			// idempotency_key: `concurrent-track-${i}`,
		}),
	);

	const trackResults = await Promise.all(trackPromises);

	// All track calls should succeed
	for (const result of trackResults) {
		expect(result.balance).toBeDefined();
	}

	// Verify final state: 50 - 10 = 40 current_balance
	const customerAfter = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerAfter.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 0,
		purchased_balance: 50,
		current_balance: 40,
		usage: 10,
	});
});
