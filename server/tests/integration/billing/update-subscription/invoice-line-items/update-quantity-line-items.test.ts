import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("update-quantity-line-items 1: increase quantity - line items persisted")}`, async () => {
	const customerId = "update-qty-li-increase";
	const billingUnits = 100;
	const pricePerPack = 10;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro-prepaid",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		balance: 400,
	});

	expectLatestInvoiceCorrect({
		customer: customerAfter,
		productId: pro.id,
		amount: 30,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 30,
		expectedLineItems: [
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 40,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity-line-items 2: increase multiple features - line items persisted")}`, async () => {
	const customerId = "update-qty-li-multi-feature";
	const messagesBillingUnits = 100;
	const wordsBillingUnits = 100;
	const messagesPricePerPack = 10;
	const wordsPricePerPack = 5;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: messagesBillingUnits,
		price: messagesPricePerPack,
	});

	const prepaidWords = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: wordsBillingUnits,
		price: wordsPricePerPack,
	});

	const pro = products.pro({
		id: "pro-multi-prepaid",
		items: [prepaidMessages, prepaidWords],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			}),
		],
	});

	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 300 },
			{ feature_id: TestFeature.Words, quantity: 400 },
		],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedTotal: 35,
		expectedLineItems: [
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: -10,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			{
				featureId: TestFeature.Messages,
				billingTiming: "in_advance",
				totalAmount: 30,
				direction: "charge",
				totalQuantity: 300,
				paidQuantity: 300,
			},
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: -5,
				direction: "refund",
				totalQuantity: 100,
				paidQuantity: 100,
			},
			{
				featureId: TestFeature.Words,
				billingTiming: "in_advance",
				totalAmount: 20,
				direction: "charge",
				totalQuantity: 400,
				paidQuantity: 400,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("update-quantity-line-items 3: prorate next cycle increase - deferred proration on renewal")}`, async () => {
	const customerId = "update-qty-li-prorate-next";
	const billingUnits = 100;
	const pricePerPack = 10;
	const basePrice = 20;

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const pro = products.pro({
		id: "pro-prorate-next",
		items: [prepaidMessages],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 400 }],
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: afterUpdate,
		featureId: TestFeature.Messages,
		balance: 400,
	});

	const finalizedInvoices = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedInvoices?.length).toBe(invoiceCountBefore);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
	});

	const renewalInvoice = afterCycle.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "charge",
				amount: basePrice,
				productId: pro.id,
			},
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				billingTiming: "in_advance",
				prorated: true,
				productId: pro.id,
				totalAmount: -10,
				minCount: 1,
			},

			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				totalAmount: 80,
				productId: pro.id,
				minCount: 2,
			},
		],
	});
});
