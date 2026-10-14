import { expect, test } from "bun:test";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const customerV2 = await autumnV1.customers.get(customerId);
	const productV2 = customerV2.products.find((p) => p.id === pro.id);
	expect(productV2?.version).toBe(2);

	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	const previewV3 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	expect(previewV3.total).toBe(10);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	const customer = await autumnV1.customers.get(customerId);
	const productV3 = customer.products.find((p) => p.id === pro.id);
	expect(productV3?.version).toBe(3);

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

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	const previewV3 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	expect(previewV3.subtotal).toBe(20);
	expect(previewV3.invoice_credits?.applied).toBe(10);
	expect(previewV3.total).toBe(10);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

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

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const priceItemV3 = items.monthlyPrice({ price: 40 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV3],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 3,
	});

	const customerV3 = await autumnV1.customers.get(customerId);
	const productV3 = customerV3.products.find((p) => p.id === pro.id);
	expect(productV3?.version).toBe(3);

	const previewV1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	expect(previewV1.total).toBe(-20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	const customer = await autumnV1.customers.get(customerId);
	const product = customer.products.find((p) => p.id === pro.id);
	expect(product?.version).toBe(1);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 4,
		latestTotal: previewV1.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

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

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const customerAfterFirst = await autumnV1.customers.get(customerId);
	expect(
		customerAfterFirst.products.find((p) => p.id === pro.id)?.version,
	).toBe(2);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 1,
	});

	const customerAfterSecond = await autumnV1.customers.get(customerId);
	expect(
		customerAfterSecond.products.find((p) => p.id === pro.id)?.version,
	).toBe(1);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		version: 2,
	});

	const customer = await autumnV1.customers.get(customerId);
	expect(customer.products.find((p) => p.id === pro.id)?.version).toBe(2);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 4,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("version-multi: customers on different versions")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItemV1] });

	const customer1Id = "version-multi-cus1";
	const customer2Id = "version-multi-cus2";

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

	const priceItemV2 = items.monthlyPrice({ price: 30 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItem, priceItemV2],
	});

	await initScenario({
		customerId: customer2Id,
		setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [] })],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customer2Id,
		product_id: pro.id,
	});

	const customer1 = await autumnV1.customers.get(customer1Id);
	expect(customer1.products.find((p) => p.id === pro.id)?.version).toBe(1);

	const customer2 = await autumnV1.customers.get(customer2Id);
	expect(customer2.products.find((p) => p.id === pro.id)?.version).toBe(2);

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
