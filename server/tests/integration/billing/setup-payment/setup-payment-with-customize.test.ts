import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { FreeTrialDuration } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import {
	expectCustomerFeatureCorrect,
	expectCustomerFeatureExists,
} from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	calculateTrialEndMs,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeSetupPaymentFormV2 as completeSetupPaymentForm } from "@tests/utils/browserPool/completeSetupPaymentFormV2";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import testCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

test.concurrent(`${chalk.yellowBright("setup-payment: attach plan with custom price")}`, async () => {
	const customerId = "setup-pay-customize-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const base = products.base({ id: "base", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: base.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
		},
	});

	expect(res.url).toBeDefined();

	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [base.id],
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
		latestTotal: 30,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: custom items override")}`, async () => {
	const customerId = "setup-pay-customize-items";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			items: [itemsV2.monthlyMessages({ included: 250 }), itemsV2.dashboard()],
		},
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
		includedUsage: 250,
		balance: 250,
		usage: 0,
	});

	await expectCustomerFeatureExists({
		customer,
		featureId: TestFeature.Dashboard,
	});

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: custom items + price + feature_quantities")}`, async () => {
	const customerId = "setup-pay-customize-items-qty";

	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: base.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 30 }),
			items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 })],
		},
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [base.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 50 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: custom free trial")}`, async () => {
	const customerId = "setup-pay-customize-trial";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		customize: {
			free_trial: {
				duration_length: 7,
				duration_type: FreeTrialDuration.Day,
				card_required: true,
			},
		},
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: calculateTrialEndMs({ trialDays: 7 }),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 0 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeTrialing: true,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: specific version")}`, async () => {
	const anchorId = "setup-pay-version-anchor";
	const testId = "setup-pay-version";

	const messagesV1 = items.monthlyMessages({ includedUsage: 100 });
	const priceV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesV1, priceV1] });

	const { autumnV1, ctx } = await initScenario({
		customerId: anchorId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro], customerIdsToDelete: [anchorId, testId] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyPrice({ price: 40 }),
		],
	});

	await initScenario({
		customerId: testId,
		setup: [s.customer({}), s.products({ list: [] })],
		actions: [],
	});

	const res = await autumnV1.billing.setupPayment({
		customer_id: testId,
		plan_id: pro.id,
		version: 1,
	});

	expect(res.url).toBeDefined();
	await completeSetupPaymentForm({ url: res.url });

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId: testId,
		active: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(testId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const product = customer.products?.find((p) => p.id === pro.id);
	expect(product?.version).toBe(1);

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 20 });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId: testId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment: discount")}`, async () => {
	const customerId = "setup-pay-discount";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: testCtx.org, env: testCtx.env });
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 50 });

	const res = await autumnV1.billing.setupPayment({
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
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
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({ customer, count: 1, latestTotal: 10 });
});
