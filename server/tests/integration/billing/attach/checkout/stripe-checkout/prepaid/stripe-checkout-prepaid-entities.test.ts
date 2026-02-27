import { expect, test } from "bun:test";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProductCorrect } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const BILLING_UNITS = 100;
const PRICE_PER_UNIT = 10;

const INCLUDED_USAGE = 100;

test.concurrent(`${chalk.yellowBright("attach: stripe checkout prepaid entities")}`, async () => {
	const customerId = "prepaid-ent-two-included";
	const quantity1 = 300;

	const prepaidItem = items.prepaidMessages({
		includedUsage: INCLUDED_USAGE,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
	});

	const pro = products.base({
		id: "base-prepaid-ent-inc",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const params = {
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	};

	const preview = await autumnV1.billing.previewAttach(params);
	expect(preview.total).toBe(20);

	// Attach to entity 1
	const res = await autumnV1.billing.attach(params);
	expect(res.payment_url).toBeDefined();
	expect(res.payment_url).toContain("checkout.stripe.com");

	// Complete checkout

	await completeStripeCheckoutFormV2({ url: res.payment_url });

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerProductCorrect({
		customerId,
		customer: customerAfter,
		productId: pro.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: quantity1,
		balance: quantity1,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
test.concurrent(`${chalk.yellowBright("attach: stripe checkout prepaid volume entities")}`, async () => {
	const customerId = "prepaid-ent-two-volume";
	const quantity1 = 600;

	const prepaidItem = items.volumePrepaidMessages({
		includedUsage: 100,
		billingUnits: 1,
		tiers: [
			{ to: 500, amount: 0, flat_amount: 30 },
			{ to: "inf" as const, amount: 0, flat_amount: 50 },
		],
	});

	const pro = products.base({
		id: "base-prepaid-ent-vol",
		items: [prepaidItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const params = {
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: quantity1 }],
		redirect_mode: "if_required",
	};

	const preview = await autumnV1.billing.previewAttach(params);
	expect(preview.total).toBe(30); // flat amount

	// Attach to entity 1
	const res = await autumnV1.billing.attach(params);
	expect(res.payment_url).toBeDefined();
	expect(res.payment_url).toContain("checkout.stripe.com");

	// Complete checkout

	await completeStripeCheckoutFormV2({ url: res.payment_url });

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerProductCorrect({
		customerId,
		customer: customerAfter,
		productId: pro.id,
		state: "active",
	});

	expectCustomerFeatureCorrect({
		customerId,
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: quantity1,
		balance: quantity1,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		customer: customerAfter,
		count: 1,
		latestTotal: 30, // flat amount
		latestStatus: "paid",
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});
