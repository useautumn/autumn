import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Update While Trialing Tests
 *
 * Tests for scenarios where a customer updates their plan while in a trial period,
 * adding new item types (consumable, allocated, prepaid).
 */

// 1. Pro with trial -> add consumable messages mid-trial
test.concurrent(`${chalk.yellowBright("trial-update: add consumable messages while trialing")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-update-consumable",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});

	// Add consumable messages to the plan while trialing
	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 50,
	});
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [consumableMessagesItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial (consumable doesn't charge upfront)
	expect(preview.total).toEqual(0);

	// next_cycle should align with existing trial (~9 days remaining from 14-day trial after 5 days advanced)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Original messages feature should be unchanged
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: consumableMessagesItem.included_usage,
		balance: consumableMessagesItem.included_usage,
		usage: 0,
	});

	// No charge during trial
	expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Just the $0 trial invoice
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Free -> add allocated users while trialing
test.concurrent(`${chalk.yellowBright("trial-update: free to allocated users while trialing")}`, async () => {
	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const monthlyPriceItem = items.monthlyPrice();

	const proTrial = products.base({
		items: [usersItem, monthlyPriceItem],
		id: "free-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-update-allocated",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 3 }),
		],
	});

	// Track some users before update
	const usersUsage = 3;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: usersUsage,
		},
		{ timeout: 2000 },
	);

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});

	// Update to add allocated users (prorated seats) and a price
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [allocatedUsersItem, monthlyPriceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should align with existing trial (~11 days remaining)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(11),
		total: monthlyPriceItem.price! + 30, // base price + 3 allocated users * $10
	});

	await autumnV1.subscriptions.update(updateParams, {
		timeout: 2000,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Users feature should reflect the allocated seats
	// Balance = included (2) + quantity (5) - usage (3) = 4
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: allocatedUsersItem.included_usage,
		balance: -usersUsage,
		usage: usersUsage,
	});

	// No charge during trial
	expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Just the $0 trial invoice
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Pro with trial -> add prepaid messages mid-trial
test.concurrent(`${chalk.yellowBright("trial-update: add prepaid messages while trialing")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-update-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 7 }),
		],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});

	// Add prepaid messages (purchase units upfront)
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [prepaidMessagesItem, priceItem],
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }], // Purchase 200 units (2 packs)
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Prepaid should charge upfront even during trial: 2 packs * $10 = $20
	expect(preview.total).toEqual(0);

	// next_cycle should align with existing trial (~7 days remaining)
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: priceItem.price! + 20, // base price + prepaid renewal
	});

	await autumnV1.subscriptions.update(updateParams, { timeout: 2000 });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Messages feature should have original included usage + prepaid quantity
	// Balance = included (100) + prepaid (200) = 300
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Invoice should have the prepaid charge
	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // $0 trial invoice + $20 prepaid charge
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
