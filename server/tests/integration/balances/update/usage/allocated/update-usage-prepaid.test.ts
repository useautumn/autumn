import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-usage-prepaid1: set usage with prepaid balance")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 3 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const prepaidItem = items.prepaidUsers();
	const prepaidAddOn = products.oneOffAddOn({
		id: "prepaid-users",
		items: [prepaidItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-prepaid1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidAddOn] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.billing.attach({
				productId: prepaidAddOn.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: 5,
					},
				],
			}),
		],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 6,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		purchased_balance: 5,
		current_balance: 2,
		usage: 6,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		purchased_balance: 5,
		current_balance: 2,
		usage: 6,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-prepaid2: usage exceeding granted + prepaid")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 3 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const prepaidItem = items.prepaidUsers();
	const prepaidAddOn = products.oneOffAddOn({
		id: "prepaid-users",
		items: [prepaidItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-prepaid2",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidAddOn] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.billing.attach({
				productId: prepaidAddOn.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: 2,
					},
				],
			}),
		],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 7,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 4,
		usage: 7,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		current_balance: 0,
		purchased_balance: 4,
		usage: 7,
	});
});

test.concurrent(`${chalk.yellowBright("update-usage-prepaid3: reset usage to 0 restores full balance")}`, async () => {
	const usersItem = items.freeAllocatedUsers({ includedUsage: 3 });
	const freeProd = products.base({ id: "free", items: [usersItem] });

	const prepaidItem = items.prepaidUsers();
	const prepaidAddOn = products.oneOffAddOn({
		id: "prepaid-users",
		items: [prepaidItem],
	});

	const { customerId, autumnV2 } = await initScenario({
		customerId: "update-usage-prepaid3",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProd, prepaidAddOn] }),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.billing.attach({
				productId: prepaidAddOn.id,
				options: [
					{
						feature_id: TestFeature.Users,
						quantity: 4,
					},
				],
			}),
		],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 5,
	});

	const afterTrack = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(afterTrack.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		purchased_balance: 4,
		current_balance: 2,
		usage: 5,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		usage: 0,
	});

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		purchased_balance: 4,
		current_balance: 7,
		usage: 0,
	});

	const customerDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(customerDb.balances[TestFeature.Users]).toMatchObject({
		granted_balance: 3,
		purchased_balance: 4,
		current_balance: 7,
		usage: 0,
	});
});
