import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("setup-payment: attach paid plan after setup")}`, async () => {
	const customerId = "setup-pay-paid-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
	});

	expect(res.customer_id).toBe(customerId);
	expect(res.url).toBeDefined();
	expect(res.url).toContain("checkout.stripe.com");

	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
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
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: attach free plan after setup")}`, async () => {
	const customerId = "setup-pay-free-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: free.id,
	});

	expect(res.url).toBeDefined();

	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [free.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({ customer, count: 0 });

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: attach plan with feature_quantities (prepaid)")}`, async () => {
	const customerId = "setup-pay-prepaid";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(res.url).toBeDefined();

	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 40,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
