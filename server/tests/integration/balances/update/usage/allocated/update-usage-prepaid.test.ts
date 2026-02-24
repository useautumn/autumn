import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PREPAID1: Set usage with prepaid balance
// Formula: targetBalance = granted + prepaid - usage
// prepaidUsers: $10/seat, billingUnits=1
// ═══════════════════════════════════════════════════════════════════

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

	// Initial: granted=3, prepaid=5 (5 * 1), current=8, usage=0
	// Set usage to 6: targetBalance = 3 + 5 - 6 = 2
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

	// Verify DB sync
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PREPAID2: Set usage exceeding granted + prepaid (overage)
// Overage absorbed into purchased_balance
// ═══════════════════════════════════════════════════════════════════

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

	// Initial: granted=3, prepaid=2, current=5
	// Set usage to 7: targetBalance = 3 + 2 - 7 = -2
	// Overage of 2 absorbed into purchased_balance (2 + 2 = 4)
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

	// Verify DB sync
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

// ═══════════════════════════════════════════════════════════════════
// UPDATE-USAGE-PREPAID3: Reset usage to 0 with prepaid (full restore)
// ═══════════════════════════════════════════════════════════════════

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

	// Initial: granted=3, prepaid=4, current=7
	// First set usage to 5 so we have something to reset
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

	// Reset usage to 0: targetBalance = 3 + 4 - 0 = 7
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

	// Verify DB sync
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
