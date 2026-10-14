import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: immediate cancel creates no new invoice")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-cancel-no-invoice",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(5);
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 50,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfter,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 50,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: comparison with default prorate_immediately")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidDefault = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const prepaidDeferred = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const proDefault = products.base({
		id: "pro-default",
		items: [prepaidDefault],
	});
	const proDeferred = products.base({
		id: "pro-deferred",
		items: [prepaidDeferred],
	});

	const {
		customerId: customerDefault,
		autumnV1: autumnDefault,
		ctx: ctxDefault,
	} = await initScenario({
		customerId: "bb-cancel-compare-default",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proDefault] }),
		],
		actions: [
			s.attach({
				productId: "pro-default",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	const {
		customerId: customerDeferred,
		autumnV1: autumnDeferred,
		ctx: ctxDeferred,
	} = await initScenario({
		customerId: "bb-cancel-compare-deferred",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proDeferred] }),
		],
		actions: [
			s.attach({
				productId: "pro-deferred",
				options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
			}),
		],
	});

	const defaultParams = {
		customer_id: customerDefault,
		product_id: proDefault.id,
		cancel_action: "cancel_immediately" as const,
	};
	const previewDefault =
		await autumnDefault.subscriptions.previewUpdate(defaultParams);
	expect(previewDefault.total).toBeLessThan(0);
	const deferredParams = {
		customer_id: customerDeferred,
		product_id: proDeferred.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const previewDeferred =
		await autumnDeferred.subscriptions.previewUpdate(deferredParams);
	expect(previewDeferred.total).toBe(0);
	await autumnDefault.subscriptions.update(defaultParams);

	await autumnDeferred.subscriptions.update(deferredParams);

	const customerDefaultAfter =
		await autumnDefault.customers.get<ApiCustomerV3>(customerDefault);
	const customerDeferredAfter =
		await autumnDeferred.customers.get<ApiCustomerV3>(customerDeferred);

	await expectProductNotPresent({
		customer: customerDefaultAfter,
		productId: proDefault.id,
	});
	await expectProductNotPresent({
		customer: customerDeferredAfter,
		productId: proDeferred.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerDefaultAfter,
		count: 2,
	});

	expectCustomerInvoiceCorrect({
		customer: customerDeferredAfter,
		count: 1,
	});

	await expectNoStripeSubscription({
		db: ctxDefault.db,
		customerId: customerDefault,
		org: ctxDefault.org,
		env: ctxDefault.env,
	});
	await expectNoStripeSubscription({
		db: ctxDeferred.db,
		customerId: customerDeferred,
		org: ctxDeferred.org,
		env: ctxDeferred.env,
	});
});

test.concurrent(`${chalk.yellowBright("next_cycle_only cancel: monthly price - no proration credit")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-cancel-monthly-no-credit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: 20,
	});

	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		billing_behavior: "none" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(cancelParams);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfter,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
