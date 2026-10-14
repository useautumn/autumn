import { expect, test } from "bun:test";
import type { ApiCustomer, ApiEntityV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-usage-conc1: update usage concurrent with track on same feature")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-conc1",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await Promise.allSettled([
		autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 50,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
	]);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	const balance = customer.balances[TestFeature.Messages];

	expect(balance.granted_balance).toBe(100);
	expect([50, 49, 48, 47]).toContain(balance.current_balance);
	expect(balance.usage + balance.current_balance).toBe(100);

	await timeout(2000);
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect([50, 49, 48, 47]).toContain(
		customerDb.balances[TestFeature.Messages].current_balance,
	);
});

test.concurrent(`${chalk.yellowBright("update-usage-conc2: update usage + track on different features")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 200 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem, creditsItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-conc2",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.customers.get<ApiCustomer>(customerId);
	const results = await Promise.allSettled([
		autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 60,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
	]);

	const allFulfilled = results.every((r) => r.status === "fulfilled");
	expect(allFulfilled).toBe(true);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 40,
		usage: 60,
	});

	expect(customer.balances[TestFeature.Credits]).toMatchObject({
		granted_balance: 200,
		current_balance: 196,
		usage: 4,
	});

	await timeout(2000);
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 40,
		usage: 60,
	});
	expect(customerDb.balances[TestFeature.Credits]).toMatchObject({
		granted_balance: 200,
		current_balance: 196,
		usage: 4,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-conc3: paid allocated update usage + track on messages")}`, async () => {
	const usersItem = items.allocatedUsers({ includedUsage: 2 });
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proProd = products.pro({
		id: "pro",
		items: [usersItem, messagesItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-conc3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proProd] }),
		],
		actions: [s.billing.attach({ productId: proProd.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 2,
	});

	await timeout(4000);

	await autumnV2.customers.get<ApiCustomer>(customerId);

	const results = await Promise.allSettled([
		autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			usage: 2,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		}),
	]);

	const allFulfilled = results.every((r) => r.status === "fulfilled");
	expect(allFulfilled).toBe(true);

	await timeout(4000);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 0,
		purchased_balance: 0,
		usage: 2,
	});

	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 96,
		usage: 4,
	});

	const customerV3 = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customerV3.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 0,
		purchased_balance: 0,
		usage: 2,
	});
	expect(customerV3.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 96,
		usage: 4,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 2,
		current_balance: 0,
		purchased_balance: 0,
		usage: 2,
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 96,
		usage: 4,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-conc4: entity update usage concurrent with track")}`, async () => {
	const messagesItem = items.monthlyMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
	const creditsItem = items.monthlyCredits({ includedUsage: 200 });
	const freeProd = products.base({
		id: "free",
		items: [messagesItem, creditsItem],
	});

	const { customerId, autumnV2, entities } = await initScenario({
		customerId: "update-usage-conc4",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	await autumnV2.customers.get<ApiCustomer>(customerId);
	for (const entity of entities) {
		await autumnV2.entities.get<ApiEntityV1>(customerId, entity.id);
	}

	const results = await Promise.allSettled([
		autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[0].id,
			usage: 30,
		}),
		autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entities[1].id,
			usage: 50,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
		autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		}),
	]);

	const allFulfilled = results.every((r) => r.status === "fulfilled");
	expect(allFulfilled).toBe(true);

	const entity1 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);
	expect(entity1.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 70,
		usage: 30,
	});

	const entity2 = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[1].id,
	);
	expect(entity2.balances?.[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 50,
		usage: 50,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 120,
		usage: 80,
	});
	expect(customer.balances[TestFeature.Credits]).toMatchObject({
		granted_balance: 200,
		current_balance: 197,
		usage: 3,
	});

	await timeout(2000);
	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 200,
		current_balance: 120,
		usage: 80,
	});
	expect(customerDb.balances[TestFeature.Credits]).toMatchObject({
		granted_balance: 200,
		current_balance: 197,
		usage: 3,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-conc5: idempotent repeated usage updates")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-conc5",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	for (let i = 0; i < 5; i++) {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 42,
		});
	}

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 58,
		usage: 42,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Messages]).toMatchObject({
		granted_balance: 100,
		current_balance: 58,
		usage: 42,
	});
});
