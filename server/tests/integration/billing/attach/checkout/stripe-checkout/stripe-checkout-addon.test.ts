import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 1: one-off addon to free (no PM)")}`, async () => {
	const customerId = "stripe-checkout-oneoff-addon-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const oneOffWordsItem = items.oneOffWords({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const oneOffAddon = products.oneOffAddOn({
		id: "oneoff-addon",
		items: [oneOffWordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [free, oneOffAddon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: free.id });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Words, quantity: 100 }],
	});
	expect(preview.total).toBe(20);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffAddon.id,
		options: [{ feature_id: TestFeature.Words, quantity: 100 }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free.id, oneOffAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 2: recurring addon to free (no PM)")}`, async () => {
	const customerId = "stripe-checkout-recurring-addon-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({ id: "free", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [free, recurringAddon] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: free.id });

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: recurringAddon.id,
	});
	expect(preview.total).toBe(20);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: recurringAddon.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [free.id, recurringAddon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 200,
		balance: 200,
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

test.concurrent(`${chalk.yellowBright("stripe-checkout-addon 3: pro via checkout then recurring addon")}`, async () => {
	const customerId = "stripe-checkout-pro-then-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [wordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, recurringAddon] }),
		],
		actions: [],
	});

	const proResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(proResult.payment_url).toBeDefined();
	expect(proResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: proResult.payment_url });
	await timeout(12000);

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const addonResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: recurringAddon.id,
		redirect_mode: "if_required",
	});

	expect(addonResult.payment_url).toBeFalsy();

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, recurringAddon.id],
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
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
