import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// NULL ID CONSTRAINT TESTS
// Tests for the partial unique index: (org_id, env, lower(email)) WHERE id IS NULL
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("null-id: duplicate null ID + same email returns existing with products")}`, async () => {
	const defaultGroup = "null-dup-test";
	const email = "null-dup-test@example.com";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Use prefix for product prefixing, no customer is created by initScenario
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ email }),
			s.products({ list: [freeDefault], prefix: defaultGroup }),
		],
		actions: [],
	});

	// First create with null ID - should get default product
	const data1 = await autumnV1.customers.create({
		id: null,
		name: "First Customer",
		email,
		withAutumnId: true,
		internalOptions: { default_group: defaultGroup },
	});

	expect(data1.id).toBeNull();
	expect(data1.email).toBe(email);

	// Verify first create has default product
	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(
		data1.autumn_id!,
	);
	await expectProductActive({ customer: customer1, productId: freeDefault.id });
	expect(customer1.features[TestFeature.Messages].balance).toBe(100);

	// Second create with null ID and same email - should return existing (idempotent)
	const data2 = await autumnV1.customers.create({
		id: null,
		name: "Second Customer",
		email,
		withAutumnId: true,
		internalOptions: { default_group: defaultGroup },
	});

	// Should return the same customer
	expect(data2.autumn_id).toBe(data1.autumn_id);
	expect(data2.email).toBe(email);
	// Name should be updated (upsert behavior)
	expect(data2.name).toBe("First Customer");

	// Verify second create also returns customer with default product
	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(
		data2.autumn_id!,
	);
	await expectProductActive({ customer: customer2, productId: freeDefault.id });
	expect(customer2.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("null-id: multiple customers with different emails allowed")}`, async () => {
	const emailA = "null-multi-a-test@example.com";
	const emailB = "null-multi-b-test@example.com";
	const emailC = "null-multi-c-test@example.com";

	// No products or customer needed - just need autumnV1 client
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ email: emailA }),
			s.deleteCustomer({ email: emailB }),
			s.deleteCustomer({ email: emailC }),
		],
		actions: [],
	});

	// Create multiple customers with null ID but different emails
	const data1 = await autumnV1.customers.create({
		id: null,
		name: "Customer A",
		email: emailA,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	const data2 = await autumnV1.customers.create({
		id: null,
		name: "Customer B",
		email: emailB,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	const data3 = await autumnV1.customers.create({
		id: null,
		name: "Customer C",
		email: emailC,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	// All should be created with different autumn_ids
	expect(data1.id).toBeNull();
	expect(data2.id).toBeNull();
	expect(data3.id).toBeNull();
	expect(data1.autumn_id).not.toBe(data2.autumn_id);
	expect(data2.autumn_id).not.toBe(data3.autumn_id);
});

test.concurrent(`${chalk.yellowBright("null-id: claim with ID returns existing customer with products")}`, async () => {
	const defaultGroup = "null-claim-products-test";
	const email = "null-claim-test@example.com";
	const newId = "claimed-id-test";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	// Use prefix for product prefixing, no customer is created by initScenario
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ email }),
			s.deleteCustomer({ customerId: newId }),
			s.products({ list: [freeDefault], prefix: defaultGroup }),
		],
		actions: [],
	});

	// First create with null ID - should get default product
	const data1 = await autumnV1.customers.create({
		id: null,
		name: "Null ID Customer",
		email,
		withAutumnId: true,
		internalOptions: { default_group: defaultGroup },
	});

	expect(data1.id).toBeNull();
	expect(data1.autumn_id).toBeDefined();

	// Verify default product was attached
	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(
		data1.autumn_id!,
	);
	await expectProductActive({ customer: customer1, productId: freeDefault.id });
	expectCustomerFeatureCorrect({
		customer: customer1,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Second create with same email but now with an ID - should claim and return existing
	const data2 = await autumnV1.customers.create({
		id: newId,
		name: "Now Has ID",
		email,
		withAutumnId: true,
		internalOptions: { default_group: defaultGroup },
	});

	// Should return the same customer with the new ID set
	expect(data2.id).toBe(newId);
	expect(data2.autumn_id).toBe(data1.autumn_id);

	// Verify the customer can be fetched with the new ID
	const claimedCustomer = await autumnV1.customers.get<ApiCustomerV3>(newId);
	expect(claimedCustomer.id).toBe(newId);

	// Should still have the default product
	await expectProductActive({
		customer: claimedCustomer,
		productId: freeDefault.id,
	});
	expectCustomerFeatureCorrect({
		customer: claimedCustomer,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});

test(`${chalk.yellowBright("null-id: claim existing email-null customer with ID")}`, async () => {
	const email = "same-email-test@example.com";
	const newId = "with-id-test";

	// No products or customer needed - just need autumnV1 client
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ email }),
			s.deleteCustomer({ customerId: newId }),
		],
		actions: [],
	});

	// Create customer with null ID
	const data1 = await autumnV1.customers.create({
		id: null,
		name: "Null ID Customer",
		email,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	expect(data1.id).toBeNull();

	// Create another customer with same email but WITH an ID
	// This should claim the null-id customer (upsert sets the ID)
	const data2 = await autumnV1.customers.create({
		id: newId,
		name: "Has ID Customer",
		email,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	// Should be the same customer with the new ID
	expect(data2.autumn_id).toBe(data1.autumn_id);
	expect(data2.id).toBe(newId);
});

test(`${chalk.yellowBright("null-id: case-insensitive email matching returns existing")}`, async () => {
	const emailLower = "case-test@example.com";
	const emailUpper = "CASE-TEST@EXAMPLE.COM";

	// No products or customer needed - just need autumnV1 client
	const { autumnV1 } = await initScenario({
		setup: [s.deleteCustomer({ email: emailLower })],
		actions: [],
	});

	// Create with lowercase email
	const data1 = await autumnV1.customers.create({
		id: null,
		name: "Lowercase Email",
		email: emailLower,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	expect(data1.id).toBeNull();

	// Try to create with uppercase email - should return existing (case-insensitive match)
	const data2 = await autumnV1.customers.create({
		id: null,
		name: "Uppercase Email",
		email: emailUpper,
		withAutumnId: true,
		internalOptions: { disable_defaults: true },
	});

	// Should return the same customer
	expect(data2.autumn_id).toBe(data1.autumn_id);
	// Name should be updated (upsert behavior)
	expect(data2.name).toBe("Uppercase Email");
});
