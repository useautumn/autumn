import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-quantity: upgrade 10 to 20 units")}`, async () => {
	const customerId = "inc-qty-basic-upgrade";
	const billingUnits = 12;
	const pricePerUnit = 8;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
				],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	expect(preview.total).toBe(10 * pricePerUnit);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];

	expect(feature?.balance).toBe(240);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 10 * pricePerUnit,
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: upgrade multiple features simultaneously")}`, async () => {
	const customerId = "inc-qty-multi-feature";
	const messagesBillingUnits = 10;
	const wordsBillingUnits = 100;
	const messagesPrice = 5;
	const wordsPrice = 10;

	const messagesItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: messagesBillingUnits,
		price: messagesPrice,
	});

	const wordsItem = items.prepaid({
		featureId: TestFeature.Words,
		billingUnits: wordsBillingUnits,
		price: wordsPrice,
	});

	const product = products.base({
		id: "multi_feature",
		items: [messagesItem, wordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 5 * messagesBillingUnits,
					},
					{
						feature_id: TestFeature.Words,
						quantity: 2 * wordsBillingUnits,
					},
				],
			}),
		],
	});

	const expectedAmount = 5 * messagesPrice + 3 * wordsPrice;

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 10 * messagesBillingUnits,
			},
			{
				feature_id: TestFeature.Words,
				quantity: 5 * wordsBillingUnits,
			},
		],
	});

	expect(preview.total).toBe(expectedAmount);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 10 * messagesBillingUnits,
			},
			{
				feature_id: TestFeature.Words,
				quantity: 5 * wordsBillingUnits,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(100);
	expect(customer.features?.[TestFeature.Words]?.balance).toBe(500);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: expectedAmount,
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity: upgrade one feature, keep other unchanged")}`, async () => {
	const customerId = "inc-qty-selective";
	const messagesBillingUnits = 10;
	const wordsBillingUnits = 100;
	const messagesPrice = 5;

	const product = products.base({
		id: "selective_upgrade",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits: messagesBillingUnits,
				price: messagesPrice,
			}),
			items.prepaid({
				featureId: TestFeature.Words,
				billingUnits: wordsBillingUnits,
			}),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.attach({
				productId: product.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 10 * messagesBillingUnits,
					},
					{
						feature_id: TestFeature.Words,
						quantity: 5 * wordsBillingUnits,
					},
				],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 15 * messagesBillingUnits,
			},
			{
				feature_id: TestFeature.Words,
				quantity: 5 * wordsBillingUnits,
			},
		],
	});

	expect(preview.total).toBe(5 * messagesPrice);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 15 * messagesBillingUnits,
			},
			{
				feature_id: TestFeature.Words,
				quantity: 5 * wordsBillingUnits,
			},
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
	expect(customer.features?.[TestFeature.Words]?.balance).toBe(500);

	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 5 * messagesPrice,
	});

	const stripeInvoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id!,
	});

	const latestInvoice = stripeInvoices.data[0];
	expect(latestInvoice.lines.data.length).toBe(2);
});
