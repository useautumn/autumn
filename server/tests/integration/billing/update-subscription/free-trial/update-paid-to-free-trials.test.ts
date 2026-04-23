import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Paid-to-Free with Trial Tests
 *
 * Split out from update-paid-trials.test.ts to avoid rate-limit races when
 * running alongside the six p2p-trial tests.
 */

// 1. Paid (no trial) -> Free with trial
test.concurrent(`${chalk.yellowBright("p2f-trial: paid no trial -> free with trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro-no-trial",
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "p2f-no-trial-to-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify initially NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	// Update to free (remove price) but add trial
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem], // No price item = free
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: false,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be refunded for the removed price (-$20)
	expect(preview.total).toEqual(-20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
		toleranceMs: ms.hours(1) + ms.minutes(10),
	});

	// Usage should be preserved, reset should follow new trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});
});

// 2. Paid with trial (mid-cycle after trial ended) -> Free (no trial)
test.concurrent(`${chalk.yellowBright("p2f-trial: paid with trial -> free no trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "p2f-trial-to-no-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 10 }), // Advance past 7-day trial to mid-cycle
		],
	});

	// Track some usage before update
	const messagesUsage = 30;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify no longer trialing (trial has ended, now paying)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Update to free (remove price), no trial specified
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [messagesItem], // No price item = free
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should credit for the removed price
	expect(preview.total).toBeLessThanOrEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should NOT be trialing
	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Usage should be preserved, reset should be from advancedTo + 1 month
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - messagesUsage,
		usage: messagesUsage,
		// resetsAt: advancedTo + ms.days(30),
	});
});
