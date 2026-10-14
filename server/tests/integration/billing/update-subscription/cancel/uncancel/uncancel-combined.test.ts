import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductTrialing,
	getTrialEndsAt,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

test.concurrent(`${chalk.yellowBright("uncancel + update quantity")}`, async () => {
	const customerId = "uncancel-plus-qty";
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [prepaidItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const messagesUsage = 40;
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: messagesUsage,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		usage: messagesUsage,
		skipCache: true,
		settleTimeoutMs: 10_000,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	const newQuantity = 200;
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		newQuantity - messagesUsage,
	);

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { shouldBeCanceling: false },
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUncancel,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel + custom plan (items)")}`, async () => {
	const customerId = "uncancel-plus-items";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const newPriceItem = items.monthlyPrice({ price: 30 });

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		items: [updatedMessagesItem, newPriceItem],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		items: [updatedMessagesItem, newPriceItem],
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		200,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterUncancel,
		count: 2,
		latestTotal: preview.total,
	});
});

test.concurrent(`${chalk.yellowBright("uncancel trialing product")}`, async () => {
	const customerId = "uncancel-trialing";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	const trialEndsAtBefore = await getTrialEndsAt({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});
	expect(trialEndsAtBefore).toBeDefined();

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		cancel_action: "uncancel",
	});

	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer: customerAfterUncancel,
		productId: proTrial.id,
	});

	const trialEndsAtAfter = await getTrialEndsAt({
		customer: customerAfterUncancel,
		productId: proTrial.id,
	});

	expect(trialEndsAtAfter).toBeDefined();
	expect(
		Math.abs(trialEndsAtAfter! - trialEndsAtBefore!) < ms.minutes(10),
	).toBe(true);

	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
