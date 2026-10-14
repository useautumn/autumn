import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeInvoiceConfirmationV2 as completeInvoiceConfirmation } from "@tests/utils/browserPool/completeInvoiceConfirmationV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("deferred-line-items A: invoice mode (finalized, deferred)")}`, async () => {
	const customerId = "def-li-invoice-mode";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const basePrice = 20;
	const messagesQuantity = 200;
	const messagesPrice = 20;
	const expectedTotal = basePrice + messagesPrice;

	const pro = products.pro({
		id: "pro-def-inv",
		items: [prepaidMessages],
	});

	const { autumnV1, ctx: testCtx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
		invoice: true,
		finalize_invoice: true,
		enable_product_immediately: false,
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.status).toBe("open");
	expect(result.invoice!.stripe_id).toBeDefined();
	expect(result.payment_url).toBeDefined();

	const stripeInvoiceId = result.invoice!.stripe_id;

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});

	await completeInvoiceCheckout({
		url: result.payment_url!,
		ctx: testCtx,
		customerId,
	});

	await timeout(5000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: expectedTotal,
		latestStatus: "paid",
	});

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("deferred-line-items B: payment failure (3DS required)")}`, async () => {
	const customerId = "def-li-3ds";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const basePrice = 20;
	const messagesQuantity = 200;
	const messagesPrice = 20;
	const expectedTotal = basePrice + messagesPrice;

	const pro = products.pro({
		id: "pro-def-3ds",
		items: [prepaidMessages],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "authenticate" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	expect(result.required_action).toBeDefined();
	expect(result.required_action?.code).toBe("3ds_required");
	expect(result.payment_url).toBeDefined();

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const stripeInvoiceId = result.invoice!.stripe_id;

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	expect(stripeInvoice.status).toBe("open");

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]).toBeUndefined();

	await completeInvoiceConfirmation({ url: result.payment_url! });

	await timeout(5000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: expectedTotal,
		latestStatus: "paid",
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			{ isBasePrice: true, amount: basePrice },
			{
				featureId: TestFeature.Messages,
				totalAmount: messagesPrice,
				billingTiming: "in_advance",
			},
		],
	});
});
