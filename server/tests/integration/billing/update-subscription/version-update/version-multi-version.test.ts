import { expect, test } from "bun:test";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-VERSION: Scenarios with multiple product versions (v1, v2, v3)
// ═══════════════════════════════════════════════════════════════════════════════

// 4.1 Sequential upgrades: v1 → v2 → v3
test.concurrent(`${chalk.yellowBright("version-multi: sequential v1 to v2 to v3")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-multi-seq",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $30 price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// Update to v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// Verify on v2
	const customerV2 = await autumnV1.customers.get(customerId);
	const productV2 = customerV2.products.find((p) => p.id === pro.id);
	expect(productV2?.version).toBe(2);

	// Create v3 with $40 price (need to update customer to v2 first for versioning to trigger)
	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	// Update to v3
	const previewV3 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	// Should charge $10 difference ($40 - $30)
	expect(previewV3.total).toBe(10);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	// Verify on v3
	const customer = await autumnV1.customers.get(customerId);
	const productV3 = customer.products.find((p) => p.id === pro.id);
	expect(productV3?.version).toBe(3);

	// Should have 3 invoices (initial + v2 upgrade + v3 upgrade)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: previewV3.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.2 Skip v2, go directly to v3
test.concurrent(`${chalk.yellowBright("version-multi: skip v2 go to v3")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-multi-skip",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $30 price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// Update to v2 first (required to create v3)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// Create v3 with $40 price
	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	// Now downgrade to v1 first (so we can test skipping v2)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	// Now skip v2 and go directly to v3
	const previewV3 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	// Should charge $20 difference ($40 - $20)
	expect(previewV3.total).toBe(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	// Verify on v3
	const customer = await autumnV1.customers.get(customerId);
	const product = customer.products.find((p) => p.id === pro.id);
	expect(product?.version).toBe(3);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.3 Downgrade from v3 to v1
test.concurrent(`${chalk.yellowBright("version-multi: downgrade v3 to v1")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-multi-down",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $30 price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// Upgrade to v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	// Create v3 with $40 price
	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	// Upgrade to v3
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	// Verify on v3
	const customerV3 = await autumnV1.customers.get(customerId);
	const productV3 = customerV3.products.find((p) => p.id === pro.id);
	expect(productV3?.version).toBe(3);

	// Now downgrade all the way to v1
	const previewV1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	// Should credit $20 difference ($20 - $40)
	expect(previewV1.total).toBe(-20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	// Verify on v1
	const customer = await autumnV1.customers.get(customerId);
	const product = customer.products.find((p) => p.id === pro.id);
	expect(product?.version).toBe(1);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 4, // Initial + v2 + v3 + downgrade to v1
		latestTotal: previewV1.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.4 Bounce between versions: v1 → v2 → v1 → v2
test.concurrent(`${chalk.yellowBright("version-multi: bounce v1 v2 v1 v2")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "version-multi-bounce",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2 with $30 price
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// v1 → v2
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const customerAfterFirst = await autumnV1.customers.get(customerId);
	expect(
		customerAfterFirst.products.find((p) => p.id === pro.id)?.version,
	).toBe(2);

	// v2 → v1
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	const customerAfterSecond = await autumnV1.customers.get(customerId);
	expect(
		customerAfterSecond.products.find((p) => p.id === pro.id)?.version,
	).toBe(1);

	// v1 → v2 again
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const customer = await autumnV1.customers.get(customerId);
	expect(customer.products.find((p) => p.id === pro.id)?.version).toBe(2);

	// Should have 4 invoices (initial + 3 version changes)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 4,
		latestTotal: 10, // $30 - $20
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4.5 Multiple customers on different versions
test.concurrent(`${chalk.yellowBright("version-multi: customers on different versions")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const customer1Id = "version-multi-cus1";
	const customer2Id = "version-multi-cus2";

	// First customer on v1
	const { autumnV1, ctx } = await initScenario({
		customerId: customer1Id,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [pro],
				customerIdsToDelete: [customer1Id, customer2Id],
			}),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2
	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	// Second customer - use initScenario with empty products list to reuse customer1's product
	await initScenario({
		customerId: customer2Id,
		setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [] })],
		actions: [], // No attachments yet - we'll attach manually to customer1's product
	});

	// Attach customer2 to customer1's product (gets latest version v2 by default)
	// Note: pro.id was mutated by initScenario to include customer1's prefix
	await autumnV1.attach({
		customer_id: customer2Id,
		product_id: pro.id,
	});

	// Customer 1 stays on v1
	const customer1 = await autumnV1.customers.get(customer1Id);
	expect(customer1.products.find((p) => p.id === pro.id)?.version).toBe(1);

	// // Customer 2 on v2
	const customer2 = await autumnV1.customers.get(customer2Id);
	expect(customer2.products.find((p) => p.id === pro.id)?.version).toBe(2);

	// Now upgrade customer 1 to v2
	await autumnV1.subscriptions.update({
		customer_id: customer1Id,
		product_id: pro.id,
		version: 2,
	});

	const customer1Updated = await autumnV1.customers.get(customer1Id);
	expect(customer1Updated.products.find((p) => p.id === pro.id)?.version).toBe(
		2,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: customer1Id,
		org: ctx.org,
		env: ctx.env,
	});
});
