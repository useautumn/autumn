import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Multi-Product Trial Tests
 *
 * Tests for trials with entities and schedules.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Separate entities, separate trials
test.concurrent(`${chalk.yellowBright("trial-multi: separate entities have separate trials")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "trial-multi-separate",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }), // Entity 0 gets trial product
			s.attach({ productId: free.id, entityIndex: 1 }), // Entity 1 gets free product
		],
	});

	// Verify entity 0 is trialing
	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	// Verify entity 1 is also trialing (merged with entity 0's trial subscription)
	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1,
		productId: free.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	// Upgrade entity 1 to paid with a different trial length
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			card_required: true,
		},
	};

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity 1 is now trialing with 7-day trial
	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: Date.now() + ms.days(7),
	});

	// Entity 0 should still have its original 14-day trial
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	// Verify the trial end dates are different
	const entity0TrialEnd = entity0After.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	const entity1TrialEnd = entity1After.products?.find(
		(p) => p.id === free.id,
	)?.current_period_end;

	expect(entity0TrialEnd).toBeDefined();
	expect(entity1TrialEnd).toBeDefined();
	// Entity 0 trial should be ~7 days longer than entity 1
	expect(entity0TrialEnd! - entity1TrialEnd!).toBeGreaterThan(ms.days(5));

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Trial with scheduled downgrade
test.concurrent(`${chalk.yellowBright("trial-multi: trial with scheduled downgrade")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium ($50) and Pro ($20) products
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
		freeTrial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			unique_fingerprint: false,
			card_required: true,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-multi-scheduled-down",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Verify initially trialing on premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: premium.id,
	});

	// Schedule a downgrade to pro (should be scheduled since we're on premium)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Premium should be canceling (scheduled to end)
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});

	// Pro should be scheduled
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Premium should still be trialing (active until trial ends)
	await expectProductTrialing({
		customer,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Trial carry-over across schedule phases
test.concurrent(`${chalk.yellowBright("trial-multi: trial preserved when schedule exists")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "trial-multi-schedule-preserve",
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
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;

	// Update the subscription (this might create a schedule in some cases)
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
		// No free_trial param - should preserve existing trial
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// next_cycle should align with existing 14-day trial
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
		total: items.monthlyPrice().price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should still be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Verify trial end is approximately the same
	const newTrialEnd = customer.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(60000);

	// Feature updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Free to paid with trial, merging with existing subscription
test.concurrent(`${chalk.yellowBright("trial-multi: free to paid with trial merges with existing subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "trial-multi-merge",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: free.id, entityIndex: 1 }),
		],
	});

	// Verify entity 0 is on paid pro (not trialing)
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1, productId: pro.id });
	await expectProductNotTrialing({ customer: entity1, productId: pro.id });

	// Now upgrade entity 1 from free to paid with trial
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
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

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should show when 7-day trial ends
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(7),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity 1 is now trialing
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2,
		productId: free.id,
		trialEndsAt: Date.now() + ms.days(7),
	});

	// Entity 0 should still not be trialing
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotTrialing({
		customer: entity1After,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 5. Free customer -> entities subscribe to trial product -> advance cycle -> update free to paid (merges with existing)
test.concurrent(`${chalk.yellowBright("trial-multi: free to paid after trial cycle merges with subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities, testClockId } =
		await initScenario({
			customerId: "trial-multi-after-cycle",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: proTrial.id, entityIndex: 0 }), // Entity 0 gets trial product
				s.attach({ productId: free.id, entityIndex: 1 }), // Entity 1 gets free product
			],
		});

	// Verify entity 0 is trialing
	const entity0Before = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0Before,
		productId: proTrial.id,
		trialEndsAt: Date.now() + ms.days(7),
	});

	// Verify entity 1 is NOT trialing (free product)
	const entity1Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1Before,
		productId: free.id,
	});

	// Advance past trial period (10 days to be safe)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 10,
	});

	// Verify entity 0 is no longer trialing (trial ended, now active)
	const entity0AfterAdvance = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductNotTrialing({
		customer: entity0AfterAdvance,
		productId: proTrial.id,
	});
	await expectProductActive({
		customer: entity0AfterAdvance,
		productId: proTrial.id,
	});

	// Now upgrade entity 1 from free to paid with trial - should merge with existing subscription
	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// next_cycle should show when 14-day trial ends
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity 1 is now trialing with 14-day trial
	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: Date.now() + ms.days(14),
	});

	// Entity 0 should still be active (not trialing)
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotTrialing({
		customer: entity0After,
		productId: proTrial.id,
	});
	await expectProductActive({
		customer: entity0After,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
