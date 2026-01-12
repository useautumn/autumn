import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import {
	expectFeatureResetAlignedWithTrialEnd,
	expectPeriodEndsAlignedWithTrialEnd,
	expectProductTrialing,
} from "@tests/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Quantity Updates with Trial Tests
 *
 * Tests for quantity updates (prepaid, allocated) when a subscription is trialing.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Update prepaid quantity while trialing
test.concurrent(`${chalk.yellowBright("trial-qty: update prepaid quantity while trialing")}`, async () => {
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const proTrial = products.proWithTrial({
		items: [prepaidItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-qty-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({
				productId: proTrial.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify initially trialing
	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	// Initial balance should be 100 (prepaid quantity)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	// Update prepaid quantity to 200 while trialing
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// next_cycle should align with existing 14-day trial
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should still be active
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Balance should be updated to 200
	expect(customer.features[TestFeature.Messages].balance).toEqual(200);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Update allocated seats while trialing
test.concurrent(`${chalk.yellowBright("trial-qty: update allocated seats while trialing")}`, async () => {
	const allocatedItem = items.allocatedUsers({ includedUsage: 2 });

	const proTrial = products.proWithTrial({
		items: [allocatedItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-qty-allocated",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	// Track 5 users (beyond included 2)
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		},
		{ timeout: 2000 },
	);

	// Verify users tracked
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Users].usage).toEqual(5);

	// Update to increase included users to 10
	const updatedAllocatedItem = items.allocatedUsers({ includedUsage: 10 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [updatedAllocatedItem, items.monthlyPrice()],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// During trial, no proration should occur
	expect(preview.total).toEqual(0);

	// next_cycle should align with existing 14-day trial
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should still be active
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Usage preserved, but now within included
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: updatedAllocatedItem.included_usage,
		balance: updatedAllocatedItem.included_usage - 5, // 10 - 5 = 5
		usage: 5,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Verify next_reset_at aligns with trial end
test.concurrent(`${chalk.yellowBright("trial-qty: next_reset_at aligns with trial end")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-qty-reset-align",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify trialing
	const trialEndsAt = await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Verify next_reset_at aligns with trial end
	await expectFeatureResetAlignedWithTrialEnd({
		customer,
		featureId: TestFeature.Messages,
		trialEndsAt: trialEndsAt!,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Verify period_ends aligns with trial end
test.concurrent(`${chalk.yellowBright("trial-qty: period_ends aligns with trial end")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-qty-period-align",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify trialing
	const trialEndsAt = await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// For a trialing product, current_period_end IS the trial end
	// So this verifies the period_ends field equals trial end
	await expectPeriodEndsAlignedWithTrialEnd({
		customer,
		productId: proTrial.id,
		trialEndsAt: trialEndsAt!,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
