import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

test.concurrent(`${chalk.yellowBright("race: concurrent create same ID returns same customer")}`, async () => {
	const customerId = "race-same-id-test";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault], prefix: customerId }),
		],
		actions: [],
	});

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

	const autumnIds = results.map((r) => r.autumn_id);
	expect(new Set(autumnIds).size).toBe(1);
	for (const result of results) {
		expect(result.id).toBe(customerId);
		await expectProductActive({ customer: result, productId: freeDefault.id });
		expectCustomerFeatureCorrect({
			customer: result,
			featureId: TestFeature.Messages,
			balance: 100,
		});
	}

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer,
		productId: freeDefault.id,
		status: CusProductStatus.Active,
	});
	expect(customer.features[TestFeature.Messages as string]?.balance).toBe(100);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

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
});

test.concurrent(`${chalk.yellowBright("race: concurrent null ID same email returns same customer")}`, async () => {
	const email = "race-null-test@example.com";

	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ email })],
		actions: [],
	});

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

	const autumnIds = results.map((r) => r.autumn_id);
	expect(new Set(autumnIds).size).toBe(1);

	for (const result of results) {
		expect(result.email).toBe(email);
		expect(result.id).toBeNull();
	}
});

test.concurrent(`${chalk.yellowBright("race: concurrent create with default trial creates only 1 Stripe customer and no Stripe subscription")}`, async () => {
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

	const results = await Promise.all([
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			create_in_stripe: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			create_in_stripe: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
		autumnV1.customers.create({
			id: customerId,
			name: "Concurrent Trial",
			email,
			withAutumnId: true,
			create_in_stripe: true,
			internalOptions: {
				default_group: customerId,
			},
		}),
	]);

	const autumnIds = results.map((r) => r.autumn_id);
	const stripeCustomerIds = results
		.map((r) => r.stripe_id)
		.filter((id) => id !== null);
	expect(new Set(autumnIds).size).toBe(1);
	expect(new Set(stripeCustomerIds).size).toBe(1);

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

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
		status: "all",
	});
	expect(subscriptions.data.length).toBe(0);

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

});

test.concurrent(`${chalk.yellowBright("race: concurrent create with name vs without name preserves name")}`, async () => {
	const customerId = "race-name-preserve-test";
	const customerName = "John Doe";

	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ customerId })],
		actions: [],
	});

	const results = await Promise.all([
		autumnV1.customers.create({
			id: customerId,
			name: customerName,
			email: `${customerId}@example.com`,
			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
		autumnV1.customers.create({
			id: customerId,

			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
		autumnV1.customers.create({
			id: customerId,

			withAutumnId: true,
			internalOptions: {
				disable_defaults: true,
			},
		}),
	]);

	const autumnIds = results.map((r) => r.autumn_id);
	expect(new Set(autumnIds).size).toBe(1);

	const finalCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	expect(finalCustomer.name).toBe(customerName);
});
