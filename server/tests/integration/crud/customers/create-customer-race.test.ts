import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import type { Customer } from "autumn-js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// RACE CONDITION TESTS
// Tests for concurrent customer creation with default products
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("race: concurrent create same ID returns same customer")}`, async () => {
	const customerId = "race-same-id-test";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Use customerId for product prefixing, but no customer is created
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault], prefix: customerId }),
		],
		actions: [],
	});

	// Concurrent creates with same ID
	const results = await Promise.all([
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent 1",
			email: `${customerId}-1@example.com`,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent 2",
			email: `${customerId}-2@example.com`,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent 3",
			email: `${customerId}-3@example.com`,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
	]);

	// All should return the same customer
	const autumnIds = results.map((r) => r.autumn_id);
	expect(new Set(autumnIds).size).toBe(1); // All same autumn_id

	// All should have the same customer ID, free default product, and balance of 100
	for (const result of results) {
		expect(result.id).toBe(customerId);
		await expectProductActive({ customer: result, productId: freeDefault.id });
		expectCustomerFeatureCorrect({
			customer: result,
			featureId: TestFeature.Messages,
			balance: 100,
		});
	}

	// Get the customer and verify default product
	const customer = await autumnV1.customers.get<Customer>(customerId);
	expectProductAttached({
		customer,
		productId: freeDefault.id,
		status: CusProductStatus.Active,
	});
	expect(customer.features[TestFeature.Messages].balance).toBe(100);

	// Verify no duplicate customer_products in DB
	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// Count products with the same product_id
	const productCounts = fullCustomer.customer_products.reduce(
		(acc, cp) => {
			acc[cp.product.id] = (acc[cp.product.id] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	// Should only have one of each product
	for (const [_productId, count] of Object.entries(productCounts)) {
		expect(count).toBe(1);
	}
});

test.concurrent(`${chalk.yellowBright("race: concurrent null ID same email returns same customer")}`, async () => {
	const email = "race-null-test@example.com";

	// No products or customer needed - just need autumnV1 client
	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ email })],
		actions: [],
	});

	// Concurrent creates with null ID and same email
	const results = await Promise.all([
		autumnV1.customers.create({
			id: null,
			name: "Concurrent Null 1",
			email,
			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
		autumnV1.customers.create({
			id: null,
			name: "Concurrent Null 2",
			email,
			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
		autumnV1.customers.create({
			id: null,
			name: "Concurrent Null 3",
			email,
			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
	]);

	// All should succeed and return the same customer (idempotent)
	const autumnIds = results.map((r) => r.autumn_id);
	expect(new Set(autumnIds).size).toBe(1);

	// All should have the same email
	for (const result of results) {
		expect(result.email).toBe(email);
		expect(result.id).toBeNull();
	}
});

test.concurrent(`${chalk.yellowBright("race: concurrent create with default trial creates only 1 Stripe customer and subscription")}`, async () => {
	const customerId = "race-default-trial-test";
	const email = `${customerId}@example.com`;

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const trialDefault = products.defaultTrial({
		id: "trial-pro",
		items: [messagesItem],
		trialDays: 14,
		cardRequired: false,
	});

	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [trialDefault], prefix: customerId }),
		],
		actions: [],
	});

	// Concurrent creates with same ID and same params - should all return the same customer
	// NOTE: All requests must have identical params for idempotency to work correctly with Stripe
	const results = await Promise.all([
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
	]);

	// 1. All responses should return the same customer (same autumn_id)
	const autumnIds = results.map((r) => r.autumn_id);
	const stripeCustomerIds = results
		.map((r) => r.stripe_id)
		.filter((id) => id !== null);
	expect(new Set(autumnIds).size).toBe(1);
	expect(new Set(stripeCustomerIds).size).toBe(1);

	// Each response should have the correct customer ID, email, and trial product attached
	for (const result of results) {
		expect(result.id).toBe(customerId);
		expect(result.email).toBe(email);
		await expectProductTrialing({
			customer: result,
			productId: trialDefault.id,
		});
		expectCustomerFeatureCorrect({
			customer: result,
			featureId: TestFeature.Messages,
			balance: 500,
		});
	}

	// Get the full customer to verify Stripe data
	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// 2. Verify only 1 Stripe customer was created
	const stripeCustomerId = fullCustomer.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	// 3. Verify only 1 Stripe subscription was created
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
		status: "all",
	});
	expect(subscriptions.data.length).toBe(1);

	// Verify the subscription is in trialing status
	expect(subscriptions.data[0].status).toBe("trialing");

	// Verify no duplicate customer_products in DB
	const productCounts = fullCustomer.customer_products.reduce(
		(acc, cp) => {
			acc[cp.product.id] = (acc[cp.product.id] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	for (const [_productId, count] of Object.entries(productCounts)) {
		expect(count).toBe(1);
	}

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
