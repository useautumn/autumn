import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 1: prepaid + allocated + base price")}`, async () => {
	const customerId = "checkout-li-prepaid-allocated";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const messagesQuantity = 400;
	const prepaidPrice = 30;
	const allocatedPrice = 20;
	const basePrice = 20;
	const expectedTotal = basePrice + prepaidPrice + allocatedPrice;

	const pro = products.pro({
		id: "pro-checkout-li",
		items: [prepaidMessages, allocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				totalQuantity: 400,
			},
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
				totalQuantity: 5,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 2: entity-level attach with prepaid")}`, async () => {
	const customerId = "checkout-li-entity-prepaid";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 50,
		billingUnits: 50,
		price: 5,
	});
	const allocatedUsers = items.allocatedUsers({ includedUsage: 2 });

	const messagesQuantity = 200;
	const prepaidPrice = 15;
	const basePrice = 20;
	const expectedTotal = basePrice + prepaidPrice;

	const pro = products.pro({
		id: "pro-entity-checkout-li",
		items: [prepaidMessages, allocatedUsers],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	expect(entity2.products?.length ?? 0).toBe(0);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				totalQuantity: 200,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 3: entity checkout with allocated overage")}`, async () => {
	const customerId = "checkout-li-entity-allocated";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const allocatedPrice = 20;
	const basePrice = 20;
	const expectedTotal = basePrice + allocatedPrice;

	const pro = products.pro({
		id: "pro-entity-allocated-li",
		items: [monthlyMessages, allocatedUsers],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entity1Id = entities[0].id;

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});

	expect(result.payment_url).toBeDefined();

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Users,
		usage: 5,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
				totalQuantity: 5,
			},
		],
	});
});
