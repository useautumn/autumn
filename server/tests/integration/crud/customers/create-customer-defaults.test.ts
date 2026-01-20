import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { TestFeature } from "@tests/setup/v2Features.js";
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
// MULTIPLE GROUPS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("defaults: multiple groups")}`, async () => {
	const customerId = "defaults-multi-group";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const wordsItem = items.monthlyWords({ includedUsage: 500 });

	const freeGroup1 = {
		...products.base({
			id: "free-group1",
			items: [messagesItem],
			isDefault: true,
		}),
		group: "group1",
	};

	const freeGroup2 = {
		...products.base({
			id: "free-group2",
			items: [wordsItem],
			isDefault: true,
		}),
		group: "group2",
	};

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, withDefault: true }),
			s.products({ list: [freeGroup1, freeGroup2] }),
		],
		actions: [],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both products from different groups should be attached
	await expectProductActive({
		customer,
		productId: `free-group1_${customerId}`,
	});

	await expectProductActive({
		customer,
		productId: `free-group2_${customerId}`,
	});

	// Verify both feature balances
	expect(customer.features[TestFeature.Messages].balance).toBe(100);
	expect(customer.features[TestFeature.Words].balance).toBe(500);
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
