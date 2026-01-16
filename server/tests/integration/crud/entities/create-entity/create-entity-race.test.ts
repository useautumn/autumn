import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("create-entity-race: mainCusEnt path should be protected by lock")}`, async () => {
	// Product with allocated users (seats) - this creates a mainCusEnt with balance
	const usersItem = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({ items: [usersItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-entity-race-1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Try to create two entities concurrently for the Users feature
	// Since there's a mainCusEnt (allocated users with balance), the lock should be acquired
	const [result1, result2] = await Promise.allSettled([
		autumnV1.entities.create(customerId, [
			{ id: "seat-1", name: "Seat 1", feature_id: TestFeature.Users },
		]),
		autumnV1.entities.create(customerId, [
			{ id: "seat-2", name: "Seat 2", feature_id: TestFeature.Users },
		]),
	]);

	// One should succeed, one should fail with 429 (lock conflict)
	const successes = [result1, result2].filter((r) => r.status === "fulfilled");
	const failures = [result1, result2].filter((r) => r.status === "rejected");

	expect(successes.length).toBe(1);
	expect(failures.length).toBe(1);

	const failedResult = failures[0] as PromiseRejectedResult;
	// AutumnInt returns code: "rate_limit_exceeded" for 429 errors
	expect(failedResult.reason.code).toBe("rate_limit_exceeded");
});

test.concurrent(`${chalk.yellowBright("create-entity-race: non-mainCusEnt path allows concurrent creation")}`, async () => {
	// Product with messages only - no Users entitlement
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "create-entity-race-2",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	// Create entities for Users feature (no entitlement exists for this feature in the product)
	// Both should succeed since there's no mainCusEnt for Users
	const [result1, result2] = await Promise.allSettled([
		autumnV1.entities.create(customerId, [
			{ id: "user-1", name: "User 1", feature_id: TestFeature.Users },
		]),
		autumnV1.entities.create(customerId, [
			{ id: "user-2", name: "User 2", feature_id: TestFeature.Users },
		]),
	]);

	// Both should succeed
	expect(result1.status).toBe("fulfilled");
	expect(result2.status).toBe("fulfilled");
});
