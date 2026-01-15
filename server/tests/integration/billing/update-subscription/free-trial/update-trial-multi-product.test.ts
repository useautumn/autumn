import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
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
test.concurrent(`${chalk.yellowBright("trial-multi: free to paid with trial merges with existing subscription")}`, async () => {
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

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
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
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify entity 1 is also trialing (merged with entity 0's trial subscription)
	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: free.id,
	});

	// Upgrade entity 1 to paid with a different trial length
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	};

	await autumnV1.subscriptions.update(updateParams);

	// Entity 0 should still have its original 14-day trial
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify entity 1 is now trialing with 14 day trial
	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Entity 1 Pro, Entity 2 Free -> Entity 2 updates to paid with trial -> Both get trial
test.concurrent(`${chalk.yellowBright("trial-multi: free to paid with trial applies trial to all entities")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro",
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-free-to-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }), // Entity 0 gets paid pro
				s.attach({ productId: free.id, entityIndex: 1 }), // Entity 1 gets free product
			],
		});

	// Verify entity 0 is active (not trialing)
	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0,
		productId: pro.id,
	});

	// Verify entity 1 is active (free)
	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: free.id,
	});

	// Update entity 1 to paid with trial
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

	// Preview should show -$20 refund (entity 0's paid pro gets refunded)
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(-20);

	await autumnV1.subscriptions.update(updateParams, { timeout: 4000 });

	// Both entities should now be trialing
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: free.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Entity 1 Pro, Entity 2 Pro -> Entity 2 sets trial with undefined items -> Both get trial
test.concurrent(`${chalk.yellowBright("trial-multi: setting trial on one entity applies to all")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice();

	const pro = products.base({
		items: [messagesItem, priceItem],
		id: "pro",
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-set-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }), // Entity 0 gets paid pro
				s.attach({ productId: pro.id, entityIndex: 1 }), // Entity 1 gets paid pro (merges)
			],
		});

	// Verify both entities are active (not trialing)
	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0,
		productId: pro.id,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Entity 1 sets trial with items undefined
	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: pro.id,
		// items is undefined
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	// Preview should show -$40 refund (both entities refunded $20 each)
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(-40);

	await autumnV1.subscriptions.update(updateParams, { timeout: 4000 });

	// Both entities should now be trialing
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1After,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 4. Entity 1 Pro Trial, Entity 2 Pro Trial -> Entity 2 removes trial -> Both active without trial
test.concurrent(`${chalk.yellowBright("trial-multi: removing trial on one entity removes from all")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, entities, advancedTo } =
		await initScenario({
			customerId: "trial-multi-remove-trial",
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: proTrial.id, entityIndex: 0 }), // Entity 0 gets trial product
				s.attach({ productId: proTrial.id, entityIndex: 1 }), // Entity 1 gets trial product (merges)
			],
		});

	// Verify both entities are trialing
	const entity0 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductTrialing({
		customer: entity0,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity1,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Entity 1 removes trial by passing free_trial: null
	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proTrial.id,
		items: [messagesItem, items.monthlyPrice()],
		free_trial: null,
	};

	// Preview should show $40 charge (both entities charged $20 each)
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toEqual(40);

	await autumnV1.subscriptions.update(updateParams);

	// Both entities should now be active (not trialing)
	const entity0After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity0After,
		productId: proTrial.id,
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity1After,
		productId: proTrial.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3, // Initial $0 trial invoice + $20 charge for trial ending
		latestTotal: preview.total,
	});
});

// SCHEDULES

// 3. Trial carry-over across schedule phases
test.concurrent(`${chalk.yellowBright("trial-multi: trial preserved when schedule exists")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
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
		startsAt: advancedTo + ms.days(14),
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
