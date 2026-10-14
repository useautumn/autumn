import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with consumable messages")}`, async () => {
	const customerId = "stripe-checkout-annual-consumable";
	const basePrice = 200;

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-consumable",
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBe(basePrice);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with consumable + prepaid (included only)")}`, async () => {
	const customerId = "stripe-checkout-annual-mixed";
	const basePrice = 200;
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedWords = 100;

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: includedWords,
		billingUnits,
		price: pricePerPack,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-mixed",
		items: [consumableMessagesItem, prepaidWordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	const prepaidQuantity = includedWords;
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Words, quantity: prepaidQuantity }],
	});
	expect(preview.total).toBe(basePrice);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Words, quantity: prepaidQuantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: prepaidQuantity,
		balance: prepaidQuantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with allocated users (0 usage)")}`, async () => {
	const customerId = "stripe-checkout-annual-allocated";
	const basePrice = 200;
	const pricePerUser = 10;
	const userCount = 5;

	const allocatedUsersItem = items.allocatedUsers({
		includedUsage: 0,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-allocated",
		items: [allocatedUsersItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBe(basePrice);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	await timeout(4000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 10,
		latestInvoiceProductId: proAnnual.id,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: monthly plan + one-time payment - invoices paid after trial")}`, async () => {
	const premium = products.base({
		id: "premium",
		items: [
			items.annualPrice({ price: 50 }),
			items.oneOffMessages({ price: 100, billingUnits: 100, includedUsage: 0 }),
		],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "setup-payment-monthly-oneoff",
		setup: [s.customer({}), s.products({ list: [premium] })],
		actions: [],
	});

	const res = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 100,
			},
		],
	});

	await completeStripeCheckoutForm({ url: res.payment_url! });

	const customer = await autumnV1.customers.get(customerId);

	await expectProductActive({
		customer,
		productId: premium.id,
	});

	await expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});
});
