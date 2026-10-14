import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("invoice-deferred: remove trial (finalized, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "inv-def-trial-fin",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: true,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(20);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult).toMatchObject({
		payment_url: expect.any(String),
		invoice: {
			status: "open",
			stripe_id: expect.any(String),
			total: preview.total,
			hosted_invoice_url: expect.any(String),
		},
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("open");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "open",
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	await completeInvoiceCheckout({
		url: result.payment_url!,
		ctx,
		customerId,
	});

	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterPayment,
		productId: proTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPayment,
		featureId: TestFeature.Messages,
		balance: 100,
	});
});

test.concurrent(`${chalk.yellowBright("invoice-deferred: remove trial (draft, deferred)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "inv-def-trial-draft",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const newMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [newMessagesItem, newPriceItem],
		free_trial: null,
		invoice: true,
		enable_product_immediately: false,
		finalize_invoice: false,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(30);

	const result = await autumnV1.subscriptions.update(updateParams);
	const clonedResult = structuredClone(result);

	expect(clonedResult.invoice).toBeDefined();
	expect(clonedResult.invoice).toMatchObject({
		status: "draft",
		stripe_id: expect.any(String),
		total: preview.total,
		hosted_invoice_url: null,
	});

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
	);
	expect(stripeInvoice.status).toBe("draft");
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: preview.total, currency: "usd" }),
	);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "draft",
	});

	const productBeforePayment = customer.products?.find(
		(p) => p.id === proTrial.id,
	);
	expect(productBeforePayment?.status).toBe("trialing");
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const finalizedInvoice = await ctx.stripeCli.invoices.finalizeInvoice(
		result.invoice!.stripe_id,
	);
	expect(finalizedInvoice.status).toBe("open");
	expect(finalizedInvoice.hosted_invoice_url).toBeDefined();

	await completeInvoiceCheckout({
		url: finalizedInvoice.hosted_invoice_url!,
		ctx,
		customerId,
	});

	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectProductActive({
		customer: customerAfterPayment,
		productId: proTrial.id,
	});

	const productAfterPayment = customerAfterPayment.products?.find(
		(p) => p.id === proTrial.id,
	);
	expect(productAfterPayment?.status).toBe("active");

	expectCustomerFeatureCorrect({
		customer: customerAfterPayment,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterPayment,
		count: 2,
		latestTotal: preview.total,
		latestStatus: "paid",
	});
});
