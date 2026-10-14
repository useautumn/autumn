import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(`${chalk.yellowBright("f2p-trial: add paid with free_trial param")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "f2p-trial-param",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - 30,
		usage: 30,
	});

	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial -> free, update mid-trial preserves trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "f2p-trial-mid-update-preserve",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === freeWithTrial.id,
	)?.current_period_end;

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
		trialEndsAt: initialTrialEnd!,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial extends trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-extend",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === freeWithTrial.id,
	)?.current_period_end;

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
		free_trial: {
			length: 30,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	expectPreviewNextCycleCorrect({
		preview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const newTrialEnd = await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
	});

	expect(newTrialEnd!).toBeGreaterThan(initialTrialEnd!);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial to paid")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-to-paid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [messagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(priceItem.price!);

	expectPreviewNextCycleCorrect({
		preview,
		startsAt: addMonths(advancedTo, 1).getTime(),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
		nowMs: advancedTo,
	});

	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("f2p-trial: free no trial -> free with trial, items undefined")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		items: [messagesItem],
		id: "free-no-trial",
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-items-undefined",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: free.id,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("f2p-trial: free with trial, update mid-trial removes trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const freeWithTrial = products.baseWithTrial({
		items: [messagesItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "f2p-trial-mid-update-remove",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [freeWithTrial] }),
		],
		actions: [
			s.attach({ productId: freeWithTrial.id }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: freeWithTrial.id,
		items: [updatedMessagesItem],
		free_trial: null,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
		nowMs: advancedTo,
	});

	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});
});
