import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("next_cycle_only: increase quantity - no immediate charge")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-inc-qty-no-charge",
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

	const baseUpdateParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
	};

	const normalPreview =
		await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
	expect(normalPreview.total).toBeGreaterThan(0);
	const deferredPreview = await autumnV1.subscriptions.previewUpdate({
		...baseUpdateParams,
		billing_behavior: "none",
	});
	expect(deferredPreview.total).toBe(0);
	await autumnV1.subscriptions.update({
		...baseUpdateParams,
		billing_behavior: "none",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: decrease quantity - no immediate credit")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-dec-qty-no-credit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			}),
		],
	});

	const baseUpdateParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
	};

	const normalPreview =
		await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
	expect(normalPreview.total).toBeLessThan(0);
	const deferredPreview = await autumnV1.subscriptions.previewUpdate({
		...baseUpdateParams,
		billing_behavior: "none",
	});
	expect(deferredPreview.total).toBe(0);
	await autumnV1.subscriptions.update({
		...baseUpdateParams,
		billing_behavior: "none",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(5);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: paid-to-paid price increase - no immediate charge")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-p2p-inc-no-charge",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 30 });
	const baseUpdateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	};

	const normalPreview =
		await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
	expect(normalPreview.total).toBe(10);
	const deferredPreview = await autumnV1.subscriptions.previewUpdate({
		...baseUpdateParams,
		billing_behavior: "none",
	});
	expect(deferredPreview.total).toBe(0);
	await autumnV1.subscriptions.update({
		...baseUpdateParams,
		billing_behavior: "none",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: paid-to-paid price decrease - no immediate credit")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-p2p-dec-no-credit",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 20 });
	const baseUpdateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
	};

	const normalPreview =
		await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
	expect(normalPreview.total).toBe(-10);
	const deferredPreview = await autumnV1.subscriptions.previewUpdate({
		...baseUpdateParams,
		billing_behavior: "none",
	});
	expect(deferredPreview.total).toBe(0);
	await autumnV1.subscriptions.update({
		...baseUpdateParams,
		billing_behavior: "none",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("comparison: prorate_immediately creates invoice, next_cycle_only does not")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidImmediate = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const prepaidDeferred = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const proImmediate = products.base({
		id: "pro-imm",
		items: [prepaidImmediate],
	});
	const proDeferred = products.base({
		id: "pro-def",
		items: [prepaidDeferred],
	});

	const { customerId: customerImmediate, autumnV1: autumnImmediate } =
		await initScenario({
			customerId: "bb-compare-immediate",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proImmediate] }),
			],
			actions: [
				s.attach({
					productId: "pro-imm",
					options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
				}),
			],
		});

	const { customerId: customerDeferred, autumnV1: autumnDeferred } =
		await initScenario({
			customerId: "bb-compare-deferred",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proDeferred] }),
			],
			actions: [
				s.attach({
					productId: "pro-def",
					options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
				}),
			],
		});

	const immediatePreview = await autumnImmediate.subscriptions.previewUpdate({
		customer_id: customerImmediate,
		product_id: proImmediate.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		billing_behavior: "prorate_immediately",
	});
	expect(immediatePreview.total).toBeGreaterThan(0);

	const deferredPreview = await autumnDeferred.subscriptions.previewUpdate({
		customer_id: customerDeferred,
		product_id: proDeferred.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		billing_behavior: "none",
	});
	expect(deferredPreview.total).toBe(0);

	await autumnImmediate.subscriptions.update({
		customer_id: customerImmediate,
		product_id: proImmediate.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		billing_behavior: "prorate_immediately",
	});

	await autumnDeferred.subscriptions.update({
		customer_id: customerDeferred,
		product_id: proDeferred.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		billing_behavior: "none",
	});

	const customerImmediateAfter =
		await autumnImmediate.customers.get<ApiCustomerV3>(customerImmediate);
	const customerDeferredAfter =
		await autumnDeferred.customers.get<ApiCustomerV3>(customerDeferred);

	expect(customerImmediateAfter.features?.[TestFeature.Messages]?.balance).toBe(
		10,
	);
	expect(customerDeferredAfter.features?.[TestFeature.Messages]?.balance).toBe(
		10,
	);

	await expectCustomerInvoiceCorrect({
		customer: customerImmediateAfter,
		count: 2,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerDeferredAfter,
		count: 1,
	});
});

test.concurrent(`${chalk.yellowBright("default behavior: prorate_immediately when no billing_behavior specified")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "bb-default-behavior",
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

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBeGreaterThan(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
