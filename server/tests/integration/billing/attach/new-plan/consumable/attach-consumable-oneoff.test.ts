import { expect, test } from "bun:test";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("consumable-oneoff 1: attach one off base price with consumable messages")}`, async () => {
	const customerId = "consumable-oneoff-1";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 0,
	});

	const pro = products.oneOff({
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
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
	});

	const customer = await autumnV1.customers.get(customerId);
	await expectCustomerProducts({
		customer,
		active: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 50, // only charged for overage (not base price)
	});
});

test.concurrent(`${chalk.yellowBright("consumable-oneoff 2: checkout one off base price with consumable messages")}`, async () => {
	const customerId = "consumable-oneoff-2";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 0,
	});

	const pro = products.oneOff({
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: result.payment_url });

	await timeout(12000);
	const customer = await autumnV1.customers.get(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 10,
		latestInvoiceProductId: pro.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance = await autumnV1.customers.get(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 50, // only charged for overage (not base price)
		latestInvoiceProductId: pro.id,
	});
});
