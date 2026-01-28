import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductNotAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT FREE PRODUCT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("defaults: single free product")}`, async () => {
	const customerId = "defaults-single-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, withDefault: true }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: `free_${customerId}`,
	});

	expect(customer.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// FREE PRODUCT WITH TRIAL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("defaults: free product with 7-day trial")}`, async () => {
	const customerId = "defaults-free-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeTrialDefault = products.base({
		id: "free-trial",
		items: [messagesItem],
		isDefault: true,
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, withDefault: true }),
			s.products({ list: [freeTrialDefault] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should be attached and in trialing status
	await expectProductTrialing({
		customer,
		productId: `free-trial_${customerId}`,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	// Verify feature balance is still available during trial
	expect(customer.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-ENABLE PLAN OVERRIDE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("defaults: auto-enable plan override")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const messagesItemB = items.monthlyMessages({ includedUsage: 200 });

	const autoEnableProductA = products.base({
		id: "auto-enable-a",
		items: [messagesItem],
		group: "auto-enable-group-a",
		isDefault: true,
	});

	const autoEnableProductB = products.base({
		id: "auto-enable-b",
		items: [messagesItemB],
		group: "auto-enable-group-b",
		isDefault: true,
	});

	const customerIdA = "auto-enable-override-a";
	const customerIdB = "auto-enable-override-b";

	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId: customerIdA }),
			s.deleteCustomer({ customerId: customerIdB }),
			s.products({ list: [autoEnableProductA, autoEnableProductB] }),
		],
		actions: [],
	});

	const customerA = await autumnV1.customers.create({
		id: customerIdA,
		auto_enable_plan_id: autoEnableProductA.id,
	});

	const customerB = await autumnV1.customers.create({
		id: customerIdB,
		auto_enable_plan_id: autoEnableProductB.id,
	});

	expectProductActive({
		customer: customerA,
		productId: autoEnableProductA.id,
	});

	expectProductNotAttached({
		customer: customerA,
		productId: autoEnableProductB.id,
	});

	expectProductActive({
		customer: customerB,
		productId: autoEnableProductB.id,
	});

	expectProductNotAttached({
		customer: customerB,
		productId: autoEnableProductA.id,
	});
});
