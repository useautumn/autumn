import { expect, test } from "bun:test";
import { type ApiCustomerV3, ProductItemInterval } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("invoice.created multi-interval: monthly + quarterly consumables over 3 months")}`, async () => {
	const customerId = "inv-created-multi-interval";

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.consumableWords({
				includedUsage: 50,
				interval: ProductItemInterval.Quarter,
			}),
		],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 70,
	});

	let currentEpochMs = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerMonth1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerMonth1,
		count: 2,
		latestTotal: 25,
	});

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: Date.now(),
		periodEndMs: addMonths(Date.now(), 1).getTime(),
	});

	expect(customerMonth1.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth1.features[TestFeature.Words].balance).toBe(-20);
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 30,
	});

	currentEpochMs = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs,
		withPause: true,
	});

	const customerMonth2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerMonth2,
		count: 3,
		latestTotal: 30,
	});

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: addMonths(Date.now(), 1).getTime(),
		periodEndMs: addMonths(Date.now(), 2).getTime(),
	});

	expect(customerMonth2.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth2.features[TestFeature.Words].balance).toBe(-50);
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 180,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 20,
	});

	const customerBeforeMonth3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBeforeMonth3.features[TestFeature.Words].balance).toBe(-70);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs,
		withPause: true,
	});

	const customerMonth3 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerMonth3,
		count: 4,
		latestTotal: 20 + 8 + 3.5,
	});

	expect(customerMonth3.features[TestFeature.Messages].balance).toBe(100);
	expect(customerMonth3.features[TestFeature.Words].balance).toBe(50);

	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: Date.now(),
		periodEndMs: addMonths(Date.now(), 3).getTime(),
		featureId: TestFeature.Words,
	});
});
